@echo off
title Flow Kit Desktop Launcher
color 0b

echo ========================================================
echo               FLOW KIT DESKTOP LAUNCHER
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Check Python virtual environment
if not exist "venv\Scripts\python.exe" (
    echo [1/4] Chua tim thay venv, dang khoi tao moi truong Python...
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo [LOI] Khong tim thay Python tren he thong! Vui long cai dat Python 3.10+
        pause
        exit /b 1
    )
    python -m venv venv
    call venv\Scripts\python.exe -m pip install --upgrade pip
    call venv\Scripts\python.exe -m pip install -r requirements.txt
) else (
    echo [1/4] Moi truong Python venv da san sang!
)

:: 2. Check if dashboard dist exists
if not exist "dashboard\dist\index.html" (
    echo [2/4] Dashboard dist chua ton tai, dang tien hanh build...
    cd dashboard
    if not exist "node_modules" (
        echo Dang cai dat thu vien dashboard...
        call npm install
    )
    call npm run build
    cd ..
) else (
    echo [2/4] Dashboard dist da san sang!
)

:: 3. Check if desktop node_modules exists
if not exist "desktop\node_modules" (
    echo [3/4] Cai dat thu vien Electron Desktop...
    cd desktop
    call npm install
    cd ..
) else (
    echo [3/4] Electron runtime da san sang!
)

:: 4. Launch Electron Desktop App
echo [4/4] Dang khoi chay Flow Kit Desktop...
cd desktop
call npm start

pause
