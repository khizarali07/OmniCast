"""
musetalk_engine.py
------------------
Wrapper for Tencent's MuseTalk (Latent Space Inpainting lip-sync).
Uses the official TMElyralab/MuseTalk inference pipeline.
"""

import sys
import os
import io
import copy
import math
import tempfile
import subprocess
import pickle
import glob
import torch
import numpy as np
import cv2
import shutil
from pathlib import Path
from typing import Optional
from tqdm import tqdm

from app.core.logger import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()

# Append the official repo to the python path to import musetalk modules
REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "musetalk_repo"))
if REPO_DIR not in sys.path:
    sys.path.append(REPO_DIR)

from musetalk.utils.utils import get_file_type, get_video_fps, datagen, load_all_model
from musetalk.utils.preprocessing import (
    get_landmark_and_bbox,
    read_imgs,
    coord_placeholder,
)
from musetalk.utils.blending import get_image
from musetalk.utils.audio_processor import AudioProcessor
from musetalk.utils.face_parsing import FaceParsing


class MuseTalkEngine:
    def __init__(self):
        self.unet = None
        self.vae = None
        self.pe = None
        self.audio_processor = None
        self.fp = None

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.weights_dir = str(settings.weights_dir)

        # Match MuseTalk v1.5 inference defaults for stable mouth region blending.
        self.extra_margin = 10
        self.parsing_mode = "jaw"
        self.left_cheek_width = 90
        self.right_cheek_width = 90
        self.encode_crf = 16
        self.encode_preset = "slow"

        self.is_loaded = False

    def load(self):
        if self.is_loaded:
            logger.info(f"[MUSETALK] Moving models back to {self.device}...")
            if self.unet:
                self.unet.model.to(self.device)
            if self.vae:
                self.vae.vae.to(self.device)
            if self.pe:
                self.pe.to(self.device)
            if hasattr(self, "whisper") and self.whisper:
                self.whisper.to(self.device)
            return

        logger.info(f"[MUSETALK] Loading models on {self.device}...")
        try:
            unet_model_path = os.path.join(
                self.weights_dir, "musetalk", "musetalkV15", "unet.pth"
            )
            unet_config = os.path.join(
                self.weights_dir, "musetalk", "musetalkV15", "musetalk.json"
            )

            self.vae, self.unet, self.pe = load_all_model(
                unet_model_path=unet_model_path,
                vae_type="sd-vae",
                unet_config=unet_config,
                device=self.device,
            )

            whisper_path = os.path.join(self.weights_dir, "whisper")
            self.audio_processor = AudioProcessor(feature_extractor_path=whisper_path)

            from transformers import WhisperModel

            self.whisper = WhisperModel.from_pretrained(whisper_path)
            self.whisper = self.whisper.to(
                device=self.device, dtype=self.unet.model.dtype
            ).eval()
            self.whisper.requires_grad_(False)

            self.fp = FaceParsing(
                left_cheek_width=self.left_cheek_width,
                right_cheek_width=self.right_cheek_width,
            )

            self.is_loaded = True
            logger.info("[MUSETALK] ✓ All models loaded successfully.")
        except Exception as e:
            logger.error(f"[MUSETALK] Load failed: {e}")
            raise

    def unload(self):
        if self.is_loaded:
            if self.unet:
                self.unet.model.to("cpu")
            if self.vae:
                self.vae.vae.to("cpu")
            if self.pe:
                self.pe.to("cpu")
            if hasattr(self, "whisper") and self.whisper:
                self.whisper.to("cpu")

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info("[MUSETALK] Offloaded to CPU.")

    def inference(self, video_path: str, audio_path: str) -> str:
        self.load()
        logger.info(
            f"[MUSETALK] Processing video: {video_path} and audio: {audio_path}"
        )

        output_dir = os.path.dirname(video_path)
        output_basename = "temp_out"
        temp_dir = output_dir

        result_img_save_path = os.path.join(temp_dir, "output_imgs")
        os.makedirs(result_img_save_path, exist_ok=True)

        temp_vid_path = os.path.join(temp_dir, f"{output_basename}.mp4")

        # Determine the definitive dtype from the UNet (source of truth)
        weight_dtype = self.unet.model.dtype
        device = self.device

        try:
            # 1. Extract frames from video
            save_dir_full = os.path.join(temp_dir, "input_imgs")
            os.makedirs(save_dir_full, exist_ok=True)
            cmd_extract = f'ffmpeg -y -v fatal -i "{video_path}" -start_number 0 "{save_dir_full}/%08d.png"'
            subprocess.run(cmd_extract, shell=True, check=True)

            input_img_list = sorted(
                glob.glob(os.path.join(save_dir_full, "*.[jpJP][pnPN]*[gG]"))
            )
            fps = get_video_fps(video_path)
            if fps == 0 or np.isnan(fps):
                fps = 25.0

            # 2. Extract Audio Features — whisper must be on same device as input
            whisper_input_features, librosa_length = (
                self.audio_processor.get_audio_feature(
                    audio_path, weight_dtype=weight_dtype
                )
            )

            whisper_chunks = self.audio_processor.get_whisper_chunk(
                whisper_input_features,
                device,
                weight_dtype,
                self.whisper,
                librosa_length,
                fps=fps,
                audio_padding_length_left=2,
                audio_padding_length_right=2,
            )

            # 3. DWPose Face Detection & Landmarks
            logger.info("[MUSETALK] Extracting landmarks...")
            coord_list, frame_list = get_landmark_and_bbox(input_img_list, 0)

            # 4. Latent Preprocessing
            input_latent_list = []
            for bbox, frame in zip(coord_list, frame_list):
                if bbox == coord_placeholder:
                    continue
                x1, y1, x2, y2 = bbox
                y2 = min(y2 + self.extra_margin, frame.shape[0])

                crop_frame = frame[y1:y2, x1:x2]
                crop_frame = cv2.resize(
                    crop_frame, (256, 256), interpolation=cv2.INTER_LANCZOS4
                )
                latents = self.vae.get_latents_for_unet(crop_frame)
                input_latent_list.append(latents)

            # Smooth loop
            frame_list_cycle = frame_list + frame_list[::-1]
            coord_list_cycle = coord_list + coord_list[::-1]
            input_latent_list_cycle = input_latent_list + input_latent_list[::-1]

            # 5. Batched Inference
            batch_size = 4
            video_num = len(whisper_chunks)
            total = int(np.ceil(float(video_num) / batch_size))

            gen = datagen(
                whisper_chunks=whisper_chunks,
                vae_encode_latents=input_latent_list_cycle,
                batch_size=batch_size,
                delay_frame=0,
                device=device,
            )

            res_frame_list = []
            timesteps = torch.tensor([0], device=device)

            for i, (whisper_batch, latent_batch) in enumerate(gen):
                with torch.no_grad():
                    # Cast EVERYTHING to the same device + dtype before touching the UNet
                    whisper_batch = whisper_batch.to(device=device, dtype=weight_dtype)
                    latent_batch = latent_batch.to(device=device, dtype=weight_dtype)

                    audio_feature_batch = self.pe(whisper_batch)
                    pred_latents = self.unet.model(
                        latent_batch,
                        timesteps,
                        encoder_hidden_states=audio_feature_batch,
                    ).sample
                    recon = self.vae.decode_latents(pred_latents)

                    for res_frame in recon:
                        res_frame_list.append(res_frame)

            # 6. FaceParsing Seamless Paste
            logger.info("[MUSETALK] Padding generated images to original video size")
            for i, res_frame in enumerate(res_frame_list):
                bbox = coord_list_cycle[i % len(coord_list_cycle)]
                ori_frame = copy.deepcopy(frame_list_cycle[i % len(frame_list_cycle)])
                x1, y1, x2, y2 = bbox

                y2 = y2 + self.extra_margin
                y2 = min(y2, ori_frame.shape[0])

                try:
                    res_frame = cv2.resize(
                        res_frame.astype(np.uint8), (x2 - x1, y2 - y1)
                    )
                except:
                    continue

                # Combine using FaceParsing
                combine_frame = get_image(
                    ori_frame,
                    res_frame,
                    [x1, y1, x2, y2],
                    mode=self.parsing_mode,
                    fp=self.fp,
                )
                cv2.imwrite(
                    f"{result_img_save_path}/{str(i).zfill(8)}.png", combine_frame
                )

            # 7. Convert images back to video
            cmd_img2video = [
                "ffmpeg",
                "-y",
                "-v",
                "fatal",
                "-r",
                str(fps),
                "-f",
                "image2",
                "-i",
                f"{result_img_save_path}/%08d.png",
                "-vcodec",
                "libx264",
                "-preset",
                self.encode_preset,
                "-vf",
                "format=yuv420p",
                "-crf",
                str(self.encode_crf),
                temp_vid_path,
            ]
            subprocess.run(cmd_img2video, check=True)

            return temp_vid_path
        finally:
            if os.path.exists(save_dir_full):
                shutil.rmtree(save_dir_full)
            if os.path.exists(result_img_save_path):
                shutil.rmtree(result_img_save_path)

    async def generate_sync_video(
        self, video_bytes: bytes, audio_bytes: bytes
    ) -> bytes:
        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "input.mp4")
            audio_path = os.path.join(temp_dir, "input.wav")

            with open(video_path, "wb") as f:
                f.write(video_bytes)
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

            out_vid_path = self.inference(video_path, audio_path)

            final_out_path = os.path.join(temp_dir, "final.mp4")

            # Mux exact configuration specified by user
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                out_vid_path,
                "-i",
                audio_path,
                "-c:v",
                "copy",  # Avoid second lossy encode.
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                final_out_path,
            ]

            logger.info("[MUSETALK] Multiplexing Audio and Video via FFmpeg...")
            subprocess.run(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )

            with open(final_out_path, "rb") as f:
                final_bytes = f.read()

            return final_bytes
