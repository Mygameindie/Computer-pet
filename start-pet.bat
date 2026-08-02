@echo off
setlocal
title Desktop Pet

REM One-click launcher for Windows. Double-click this file to start the pet.
REM On the very first run it installs dependencies (downloads Electron);
REM after that it just launches.
REM
REM Want nothing on screen at all? Double-click start-pet-hidden.vbs instead -
REM same launcher, no console window whatsoever. This file hands over to it
REM automatically after the first run, so the window is only ever a blink.
REM
REM The pet is started DETACHED: this window is only the installer/launcher, so
REM closing it (or letting it close itself) does not stop the pet. Quit the pet
REM from the tray icon by the clock, or by right-clicking the pet itself.

cd /d "%~dp0"

REM /quiet means we were started by start-pet-hidden.vbs, into a window nobody
REM can see: never stop for a keypress, and never hand back to the .vbs.
if /i "%~1"=="/quiet" set "PET_QUIET=1"

REM Hand straight over to the windowless launcher when we can. A .bat always
REM gets a console - Windows creates it before cmd.exe runs a single line - but
REM handing over this early keeps it to a blink instead of a window that sits
REM there. Every check below is a reason to keep the window and carry on
REM normally instead: nothing here is allowed to cost anyone their pet.
if defined PET_QUIET goto :launch
if not exist "start-pet-hidden.vbs" goto :launch
REM First run installs Electron, which prints progress for minutes - show it.
if not exist "node_modules\electron\dist\electron.exe" goto :launch
if not exist "%SystemRoot%\System32\wscript.exe" goto :launch
REM Windows Script Host can be switched off by policy, and then .vbs files do
REM nothing but raise an error dialog.
for /f "tokens=3" %%V in ('reg query "HKCU\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2^>nul') do if "%%V"=="0x0" goto :launch
for /f "tokens=3" %%V in ('reg query "HKLM\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2^>nul') do if "%%V"=="0x0" goto :launch

start "" "%SystemRoot%\System32\wscript.exe" "%~dp0start-pet-hidden.vbs"
endlocal
exit /b 0

:launch
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
  if not defined PET_QUIET pause
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
    if not defined PET_QUIET pause
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
  if not defined PET_QUIET pause
  exit /b 1
)

REM No pause, no countdown: this window has done its job, so it closes at once
REM and the pet carries on without it.
endlocal
exit /b 0
