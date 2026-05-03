@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo           OmniCast Platform — Local Dev Runner
echo ============================================================

:: 1. Backend Setup
echo [SYSTEM] Checking Backend Environment...
if not exist "omnicast-backend\.venv" (
    echo [ACTION] Virtual environment not found. Creating it now...
    py -3.11 -m venv omnicast-backend\.venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create venv. Please ensure Python 3.11 is installed.
        pause
        exit /b
    )
    echo [ACTION] Installing Backend requirements...
    call omnicast-backend\.venv\Scripts\activate
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    pip install -r omnicast-backend\requirements.txt
    echo [DONE] Backend environment ready.
)

:: 2. Frontend Setup (Optional check for node_modules)
if not exist "omnicast-frontend\node_modules" (
    if exist "vocalize-frontend\node_modules" (
        echo [INFO] node_modules found in legacy folder.
    ) else (
        echo [ACTION] Frontend dependencies not found. Run 'pnpm install' in frontend if it fails.
    )
)

:: 3. Start Backend
echo [SYSTEM] Starting FastAPI Backend...
start "OmniCast Backend" cmd /k "cd omnicast-backend && call .venv\Scripts\activate && echo [BACKEND] Starting OmniCast API... && python main.py"

:: 4. Start Frontend
echo [SYSTEM] Starting Next.js Frontend...
:: Use a variable for the frontend folder to handle the transition
set FRONTEND_DIR=omnicast-frontend
if not exist "!FRONTEND_DIR!" set FRONTEND_DIR=vocalize-frontend

start "OmniCast Frontend" cmd /k "cd !FRONTEND_DIR! && echo [FRONTEND] Starting dev server... && npm run dev"

echo.
echo [SUCCESS] Both processes are launching.
echo - Backend: http://localhost:8000/docs
echo - Frontend: http://localhost:3000
echo ============================================================
echo Close the individual windows to stop the servers.
pause
