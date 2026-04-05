@echo off
setlocal

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Running with Administrator privileges...
    goto :runServer
) else (
    echo [INFO] Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:runServer
echo Starting SNet Blocker Server...
cd /d "%~dp0"
node server.js
pause
