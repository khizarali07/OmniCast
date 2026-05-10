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
from einops import rearrange

try:
    import torchvision.transforms.functional_tensor as _ft  # noqa: F401
except ModuleNotFoundError:
    import types
    import torchvision.transforms.functional as _F

    _ft = types.ModuleType("torchvision.transforms.functional_tensor")
    _ft.rgb_to_grayscale = _F.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = _ft

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

    def _build_shifted_audio_prompts(
        self,
        whisper_input_features,
        librosa_length,
        fps,
        sync_shift_frames,
        weight_dtype,
        device,
        audio_padding_length_left=2,
        audio_padding_length_right=2,
    ):
        sr = 16000
        audio_fps = 50.0
        fps = float(fps)

        whisper_feature = []
        for input_feature in whisper_input_features:
            input_feature = input_feature.to(device=device, dtype=weight_dtype)
            audio_feats = self.whisper.encoder(
                input_feature, output_hidden_states=True
            ).hidden_states
            audio_feats = torch.stack(audio_feats, dim=2)
            whisper_feature.append(audio_feats)

        whisper_feature = torch.cat(whisper_feature, dim=1)
        num_frames = math.floor((librosa_length / sr) * fps)
        actual_length = math.floor((librosa_length / sr) * audio_fps)
        whisper_feature = whisper_feature[:, :actual_length, ...]

        audio_feature_length_per_frame = 2 * (
            audio_padding_length_left + audio_padding_length_right + 1
        )
        padding_nums = math.ceil(audio_fps / fps)
        left_pad = padding_nums * audio_padding_length_left
        right_pad = padding_nums * audio_padding_length_right

        if left_pad > 0 or right_pad > 0:
            whisper_feature = torch.cat(
                [
                    torch.zeros(
                        (
                            whisper_feature.shape[0],
                            left_pad,
                            *whisper_feature.shape[2:],
                        ),
                        device=whisper_feature.device,
                        dtype=whisper_feature.dtype,
                    ),
                    whisper_feature,
                    torch.zeros(
                        (
                            whisper_feature.shape[0],
                            right_pad,
                            *whisper_feature.shape[2:],
                        ),
                        device=whisper_feature.device,
                        dtype=whisper_feature.dtype,
                    ),
                ],
                dim=1,
            )

        max_audio_start = max(
            0,
            int((num_frames - 1 + sync_shift_frames) * (audio_fps / fps)),
        )
        required_len = max_audio_start + audio_feature_length_per_frame
        if required_len > whisper_feature.shape[1]:
            pad = required_len - whisper_feature.shape[1]
            whisper_feature = torch.cat(
                [
                    whisper_feature,
                    torch.zeros(
                        (
                            whisper_feature.shape[0],
                            pad,
                            *whisper_feature.shape[2:],
                        ),
                        device=whisper_feature.device,
                        dtype=whisper_feature.dtype,
                    ),
                ],
                dim=1,
            )

        audio_prompts = []
        for frame_idx in range(num_frames):
            audio_start = max(
                0,
                int((frame_idx + sync_shift_frames) * (audio_fps / fps)),
            )
            audio_end = audio_start + audio_feature_length_per_frame
            audio_clip = whisper_feature[:, audio_start:audio_end]
            if audio_clip.shape[1] < audio_feature_length_per_frame:
                pad = audio_feature_length_per_frame - audio_clip.shape[1]
                audio_clip = torch.cat(
                    [
                        audio_clip,
                        torch.zeros(
                            (
                                audio_clip.shape[0],
                                pad,
                                *audio_clip.shape[2:],
                            ),
                            device=audio_clip.device,
                            dtype=audio_clip.dtype,
                        ),
                    ],
                    dim=1,
                )
            audio_prompts.append(audio_clip)

        audio_prompts = torch.cat(audio_prompts, dim=0)
        audio_prompts = rearrange(audio_prompts, "b c h w -> b (c h) w")
        return audio_prompts

    @torch.no_grad()
    def inference(
        self,
        video_path: str,
        audio_path: str,
        sync_shift_frames: int = 0,
    ) -> str:
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

        save_dir_full = None
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

            whisper_chunks = self._build_shifted_audio_prompts(
                whisper_input_features,
                librosa_length,
                fps,
                sync_shift_frames,
                weight_dtype,
                device,
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

            frame_index = 0
            timesteps = torch.tensor([0], device=device)

            for i, (whisper_batch, latent_batch) in enumerate(gen):
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

                # 5. Seamless Paste, Color Fix, & Sharpening
                for res_frame in recon:
                    bbox = coord_list_cycle[frame_index % len(coord_list_cycle)]
                    frame = copy.deepcopy(
                        frame_list_cycle[frame_index % len(frame_list_cycle)]
                    )
                    frame_index += 1
                    if bbox == coord_placeholder:
                        continue

                    xmin, ymin, xmax, ymax = bbox
                    ymax = ymax + self.extra_margin
                    ymax = min(ymax, frame.shape[0])

                    orig_face_w = xmax - xmin
                    orig_face_h = ymax - ymin
                    
                    if orig_face_w <= 0 or orig_face_h <= 0:
                        continue

                    generated_face = res_frame.astype(np.uint8)

                    # FIX: The model output is already BGR! Removing cvtColor to prevent turning the face blue.
                    generated_face_bgr = generated_face
                    generated_mouth_256 = generated_face_bgr[128:256, :]
                    
                    # Resize with Lanczos4 for mathematical sharpness
                    lower_half_h = orig_face_h - (orig_face_h // 2)
                    resized_mouth = cv2.resize(generated_mouth_256, (orig_face_w, lower_half_h), interpolation=cv2.INTER_LANCZOS4)
                    
                    # Unsharp Mask to crisp up the details
                    gaussian_blur = cv2.GaussianBlur(resized_mouth, (0, 0), 2.0)
                    sharpened_mouth = cv2.addWeighted(resized_mouth, 1.5, gaussian_blur, -0.5, 0)
                    
                    # Setup Coordinates
                    y1 = ymin + (orig_face_h // 2)
                    y2 = ymax
                    x1 = xmin
                    x2 = xmax
                    
                    original_crop = frame[y1:y2, x1:x2]
                    
                    # Create Feathered Mask for invisible edges
                    mask = np.zeros((lower_half_h, orig_face_w, 3), dtype=np.float32)
                    pad_x = int(orig_face_w * 0.15)
                    pad_y = int(lower_half_h * 0.15)
                    cv2.rectangle(mask, (pad_x, pad_y), (orig_face_w - pad_x, lower_half_h - pad_y), (255.0, 255.0, 255.0), -1)
                    
                    blur_size = max(21, int(orig_face_w * 0.2))
                    if blur_size % 2 == 0: 
                        blur_size += 1
                    mask = cv2.GaussianBlur(mask, (blur_size, blur_size), 0)
                    mask = mask / 255.0
                    
                    # Apply the blend using the SHARPENED mouth
                    blended = (sharpened_mouth.astype(np.float32) * mask) + (original_crop.astype(np.float32) * (1.0 - mask))
                    frame[y1:y2, x1:x2] = blended.astype(np.uint8)
                    
                    cv2.imwrite(
                        f"{result_img_save_path}/{str(frame_index - 1).zfill(8)}.png",
                        frame,
                    )

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

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
