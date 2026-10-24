@echo off
setlocal
title Browser Xray Setup
echo.
echo Browser Xray setup
echo ==================
echo Installing the local helper for the current Windows user.
echo No administrator rights are required.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo Browser Xray setup failed. Review the message above.
) else (
  echo Browser Xray is ready. Follow the extension steps above.
)
echo.
pause
exit /b %CODE%
