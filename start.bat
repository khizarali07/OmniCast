@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo           OmniCast Platform — Local Dev Runner
echo ============================================================

:: Check if backend venv exists
if not exist "omnicast-backend\.venv" (
    echo [ERROR] Backend virtual environment not found in omnicast-backend\.venv
    echo [HINT] Run: cd omnicast-backend && python -m venv .venv
    pause
    exit /b
)

:: Start Backend in a new window
echo [SYSTEM] Starting FastAPI Backend...
start "OmniCast Backend" cmd /k "cd omnicast-backend && call .venv\Scripts\activate && echo [BACKEND] Checking models and starting server... && python main.py"

:: Start Frontend in a new window
echo [SYSTEM] Starting Next.js Frontend...
start "OmniCast Frontend" cmd /k "cd vocalize-frontend && echo [FRONTEND] Starting dev server... && pnpm run dev"

echo.
echo [DONE] Both processes are starting. 
echo - Backend: http://localhost:8000/docs
echo - Frontend: http://localhost:3000
echo ============================================================
echo Close the individual windows to stop the servers.
pause
