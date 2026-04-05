@echo off

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  SNet Blocker — Native Host Setup                   ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:: Check admin
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Run as Administrator!
    pause
    exit /b 1
)

set "HOST_NAME=com.snet.launcher"
set "MANIFEST_PATH=C:\Users\reyan\OneDrive\Desktop\Projects\FIRENET\native-host\com.snet.launcher.json"

:: Register for ALL users (better)
set "REG_KEY=HKLM\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%"

echo Registering host...

reg add "%REG_KEY%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1

if %errorLevel% NEQ 0 (
    echo ❌ Failed to register
    pause
    exit /b 1
)

echo ✅ Registered successfully!

echo.
echo IMPORTANT:
echo - Make sure extension ID matches JSON
echo - Restart Chrome

pause