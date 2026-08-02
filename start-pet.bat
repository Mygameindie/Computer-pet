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

REM Ask the electron package where its executable is, and fall back to the
REM standard location if that lookup fails for any reason.
set "ELECTRON="
for /f "usebackq delims=" %%i in (`node -e "try{process.stdout.write(require('electron'))}catch(e){}"`) do set "ELECTRON=%%i"
if not defined ELECTRON set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo.
  echo   Could not find Electron inside node_modules.
  echo   Delete the node_modules folder and double-click this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting Desktop Pet...
echo   The pets drop in from the top of your main screen and land on the floor.
echo.
echo   You can close this window - the pet keeps running.
echo   To quit it: right-click a pet, or use the tray icon by the clock.
echo.

REM `start` launches Electron as its own independent process rather than as a
REM child of this console. That is what lets the pet outlive this window:
REM running `npm start` here instead ties the app to the console, so closing
REM the window takes the whole process tree - pet included - down with it.
REM Running this file again while the pet is already up does nothing harmful;
REM main.js holds a single-instance lock and just brings the pets back.
start "" "%ELECTRON%" .

REM Stay open just long enough that an instant crash is still readable here,
REM then get out of the way and close.
timeout /t 3 /nobreak >nul

endlocal
exit /b 0
