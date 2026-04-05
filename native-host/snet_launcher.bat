@echo off

set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."

:: Launch server as admin
powershell -NoProfile -Command "Start-Process '%PROJECT_DIR%\start-server.bat' -Verb RunAs"

:: Proper Native Messaging response (length-prefixed JSON)
set RESPONSE={"status":"launched"}

:: Calculate length (simple workaround)
echo %RESPONSE%>temp.txt
for %%A in (temp.txt) do set SIZE=%%~zA
del temp.txt

:: Send length (4-byte little endian)
powershell -command "[Console]::OpenStandardOutput().Write([BitConverter]::GetBytes(%SIZE%),0,4)"

:: Send JSON
echo %RESPONSE%