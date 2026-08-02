@echo off
setlocal
title Desktop Pet

REM One-click launcher for Windows. Double-click this file to start the pet.
REM On the very first run it installs dependencies (downloads Electron);
REM after that it just launches.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo.
  echo   Install it by running this in PowerShell:
  echo       winget install OpenJS.NodeJS.LTS
  echo.
  echo   Then close all PowerShell windows, open a new one,
  echo   and double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo   First run - installing dependencies.
  echo   This downloads Electron ^(about 200 MB^) and takes a few minutes.
  echo   It may look frozen at times. Please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Install failed. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   Starting Desktop Pet...
echo   The pets appear at the bottom-right of your main screen.
echo   To quit: right-click a pet, or use the tray icon by the clock.
echo.

call npm start

if errorlevel 1 (
  echo.
  echo   The app exited with an error. The message above should say why.
  echo.
  pause
)

endlocal
