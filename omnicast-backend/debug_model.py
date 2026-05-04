import torch
import numpy as np
import soundfile as sf
from omnivoice import OmniVoice
import os

# Load model
model_dir = "models"
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

print(f"Loading model on {device}...")
model = OmniVoice.from_pretrained(
    model_dir,
    device_map=device if device == "cuda" else None,
    torch_dtype=dtype
)
model.eval()

# Test generation
text = "Hello, this is a test of the OmniCast voice synthesis system."
instruct = "female, young adult"
speed = 1.0

print(f"Generating with instruct='{instruct}'...")
try:
    audio_list = model.generate(
        text=text,
        instruct=instruct,
        speed=speed
    )
    
    if audio_list:
        audio = audio_list[0]
        output_path = "debug_output.wav"
        sf.write(output_path, audio, 24000)
        print(f"Success! Saved to {output_path}")
        print(f"Audio shape: {audio.shape}, Min: {audio.min()}, Max: {audio.max()}")
    else:
        print("Error: Model returned empty list")
except Exception as e:
    print(f"Error during generation: {e}")
