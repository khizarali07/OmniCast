# OmniCast

**High-Performance AI Voice Platform**

OmniCast is a powerful, professional-grade AI Voice ecosystem designed for low-latency speech synthesis, zero-shot voice cloning, and bespoke voice design. Optimized for local hardware (RTX 3070), it combines the precision of the OmniVoice model with an intuitive, modern dashboard.

## 🚀 Core Features
- **Zero-Shot Cloning**: Clone any voice with just 5-10 seconds of reference audio.
- **Auto-Transcription**: Integrated Whisper engine for perfect voice alignment.
- **Bespoke Voice Design**: Shape demographic traits (age, gender, tone) to create unique AI personas.
- **VRAM Optimised**: Intelligent memory management (FP16 & CPU offloading) for consumer GPUs.
- **Voice Library**: Persistent storage for your custom models with local-first reliability.

## 🛠️ Technology Stack
- **Backend**: FastAPI (Python 3.11), PyTorch, OmniVoice, librosa.
- **Frontend**: Next.js 14, Tailwind CSS, TypeScript.
- **Database**: Supabase (PostgreSQL & Storage).

## 📦 Monorepo Structure
- `/omnicast-backend`: The AI inference engine and library manager.
- `/omnicast-frontend`: The sleek, glassmorphic user dashboard.

---
Developed with ❤️ by Khizar Ali.
