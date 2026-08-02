@echo off
setlocal
title Desktop Pet

REM One-click launcher for Windows. Double-click this file to start the pet.
REM On the very first run it installs dependencies (downloads Electron);
REM after that it just launches.
REM
REM The pet is started DETACHED: this window is only the installer/launcher, so
REM closing it (or letting it close itself) does not stop the pet. Quit the pet
REM from the tray icon by the clock, or by right-clicking the pet itself.

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

if not exist "node_modules\electron\dist\electron.exe" (
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

REM Hand the app over to the detached launcher, which starts Electron with no
REM console attached to it at all (DETACHED_PROCESS), then returns immediately.
REM That is what lets the pet outlive this window: a console being closed
REM signals every process attached to it, and the pet is not one of them.
REM
REM Running this file again while the pet is already up does nothing harmful;
REM main.js holds a single-instance lock and just brings the pets back.
node "scripts\start-detached.js"
if errorlevel 1 (
  echo.
  echo   The pet could not be started. The message above should say why.
  echo.
  pause
  exit /b 1
)

REM No pause, no countdown: this window has done its job, so it closes at once
REM and the pet carries on without it.
endlocal
exit /b 0
