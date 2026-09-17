@echo off
title Tani Precision Agriculture SaaS - Local Launcher
echo ======================================================================
echo   SaaS Monitoring Pertanian Presisi Tani - Local Launcher
echo ======================================================================
echo.
echo [1/2] Menjalankan Mock API Server (Port 8000)...
start "Tani Backend API (Port 8000)" cmd /k "cd /d "%~dp0backend" && "C:\Users\M S I\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe" demo_server.py"

timeout /t 2 /nobreak > nul

echo [2/2] Menjalankan Frontend Next.js (Port 3000)...
start "Tani Frontend Next.js (Port 3000)" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev"

echo.
echo ======================================================================
echo   Aplikasi Siap Diakses:
echo   - Frontend Web UI:  http://localhost:3000
echo   - Backend Mock API: http://localhost:8000/api
echo ======================================================================
echo.
echo Membuka browser ke http://localhost:3000 ...
timeout /t 3 /nobreak > nul
start http://localhost:3000
