@echo off
title Local SLM Benchmark Launcher
color 0A

echo ============================================================
echo   Local SLM Benchmark - One-Click Launcher
echo ============================================================
echo.

REM Step 1: Check if Ollama is running
echo [1/3] Checking Ollama...
curl -s http://localhost:11434 >nul 2>&1
if %errorlevel% neq 0 (
    echo  WARNING: Ollama does not appear to be running.
    echo  Please start Ollama before benchmarking models.
    echo.
) else (
    echo  Ollama is running. OK
)

REM Step 2: Start the FastAPI backend (cd into backend so relative imports work)
echo.
echo [2/3] Starting FastAPI backend on http://localhost:8000 ...
set ROOT=%~dp0
start "SLM Benchmark Backend" /MIN cmd /c "cd /d "%ROOT%backend" && "%ROOT%.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo  Waiting for server to be ready...
timeout /t 4 /nobreak >nul

set retries=0
:wait_loop
curl -s http://localhost:8000/models >nul 2>&1
if %errorlevel% equ 0 goto server_ready
set /a retries+=1
if %retries% geq 5 (
    echo  WARNING: Backend may still be starting. Opening browser anyway...
    goto open_browser
)
timeout /t 2 /nobreak >nul
goto wait_loop

:server_ready
echo  Backend is ready!

REM Step 3: Open the frontend
:open_browser
echo.
echo [3/3] Opening frontend in your default browser...
start "" "%ROOT%docs\index.html"

echo.
echo ============================================================
echo   App is running!
echo   Backend API : http://localhost:8000
echo   API Docs    : http://localhost:8000/docs
echo   Frontend    : docs\index.html (opened in browser)
echo ============================================================
echo.
echo  Press any key to STOP the backend server and exit.
pause >nul

echo.
echo  Stopping backend server...
taskkill /FI "WINDOWTITLE eq SLM Benchmark Backend" /F >nul 2>&1
taskkill /F /IM uvicorn.exe >nul 2>&1
echo  Stopped. Goodbye!
timeout /t 2 /nobreak >nul
