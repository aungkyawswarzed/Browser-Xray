@echo off
setlocal
title Browser Xray Uninstall
cd /d "%TEMP%"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
