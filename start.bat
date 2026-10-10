@echo off
title Promptfolio — Local Server Launcher
echo ========================================================
echo        PROMPTFOLIO — BNB CHAIN ETF SYNTHESIZER
echo ========================================================
echo.

echo [1/2] Starting Backend API Server on port 3001...
start "Promptfolio Backend (Port 3001)" cmd /k "cd /d %~dp0backend && npm start"

echo [2/2] Starting Frontend Web Server on port 3000...
start "Promptfolio Frontend (Port 3000)" cmd /k "cd /d %~dp0frontend && npx serve . -p 3000"

echo.
echo ========================================================
echo Both servers are launching in dedicated windows!
echo - Backend API:  http://localhost:3001/api/health
echo - Introduction: http://localhost:3000/landing.html
echo - Studio Desk:  http://localhost:3000/app.html
echo ========================================================
pause
