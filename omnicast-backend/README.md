# OmniCast Backend

High-performance FastAPI backend for AI voice synthesis & cloning on RTX 3070.

## Quick Start

### 1 — Create virtual environment & install dependencies

```powershell
# from /omnicast-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2 — Configure environment

Copy `.env` and fill in your credentials (already pre-filled for development).

### 3 — Place model weights

Drop OmniVoice weights into `./models/`.  
The model manager will detect them automatically on startup.

### 4 — Run the server

```powershell
python main.py
# or with auto-reload:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at: http://localhost:8000/docs

---

## Run Tests

```powershell
pytest tests/ -v
```

---

## File Structure

```
omnicast-backend/
├── app/
│   ├── api/
│   │   ├── tts.py          # POST /api/v1/tts/generate
│   │   └── clone.py        # POST /api/v1/clone/voice
│   ├── core/
│   │   ├── config.py       # Pydantic settings
│   │   ├── logger.py       # Colorlog setup
│   │   └── security.py     # Supabase JWT dependency
│   ├── services/
│   │   ├── model_manager.py  # OmniVoice loading + IdleGuard
│   │   └── audio_engine.py   # 24kHz mono WAV normalisation
│   └── utils/
│       └── vram.py          # @vram_managed decorator + IdleGuard
├── models/                  # OmniVoice weights go here
├── tests/
│   └── test_api.py
├── main.py
├── requirements.txt
└── .env
```

---

## RTX 3070 VRAM Strategy

| Technique | Detail |
|-----------|--------|
| `float16` | Halves model VRAM from ~8 GB → ~4 GB |
| `@vram_managed` | GC + `cuda.empty_cache()` on every inference |
| `IdleGuard` | Moves model to CPU after 5 min idle; reloads on next request |
| Startup pre-load | First request has zero cold-start latency |
