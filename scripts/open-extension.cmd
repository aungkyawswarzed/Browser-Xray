@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-extension.ps1" %*
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
