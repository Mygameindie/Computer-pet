#!/usr/bin/env node
// ===========================================================
// 🔗 scripts/make-shortcut.js — a launcher with no console window
// ===========================================================
//   npm run shortcut
//
// Puts a "Desktop Pet" shortcut on your desktop that points straight at
// Electron. Double-clicking it starts the pet with no console window at all —
// Electron is a GUI program, so unlike a .bat file there is nothing to flash
// on screen. Pin it to the taskbar or the Start menu and the pet behaves like
// any other background app: an icon to click, and a tray icon by the clock to
// show, hide and quit it.
//
// This half is Windows; `npm run shortcut` on macOS lands in
// scripts/make-app.js, which builds the equivalent .app bundle.
// ===========================================================

const { execFileSync } = require('child_process');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');

// PowerShell single-quoted strings escape a quote by doubling it. Windows
// paths can legally contain one, so don't assume they can't.
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildScript(electronPath, appDir) {
  return [
    `$desktop = [Environment]::GetFolderPath('Desktop')`,
    `$link = Join-Path $desktop 'Desktop Pet.lnk'`,
    `$shell = New-Object -ComObject WScript.Shell`,
    `$s = $shell.CreateShortcut($link)`,
    `$s.TargetPath = ${psQuote(electronPath)}`,
    `$s.Arguments = '.'`,
    `$s.WorkingDirectory = ${psQuote(appDir)}`,
    `$s.IconLocation = ${psQuote(electronPath + ',0')}`,
    `$s.Description = 'Desktop Pet'`,
    `$s.Save()`,
    `Write-Output $link`,
  ].join('; ');
}

function main() {
  // `npm run shortcut` is the same promise on every platform — a thing you can
  // double-click that opens no terminal — so send each one to its own helper.
  if (process.platform === 'darwin') {
    require('./make-app.js').makeMacApp();
    return;
  }

  if (process.platform !== 'win32') {
    console.log('There is no console window to work around here: on Linux,');
    console.log('start the pet with `npm run start:bg` and close the terminal.');
    return;
  }

  let electronPath;
  try {
    electronPath = require('electron');
  } catch (_) { /* not installed */ }

  if (typeof electronPath !== 'string' || !electronPath) {
    console.error('Electron is not installed yet. Run `npm install` in this folder first.');
    process.exit(1);
  }

  let created;
  try {
    created = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', buildScript(electronPath, APP_DIR)],
      { encoding: 'utf8' }
    ).trim();
  } catch (err) {
    console.error('Could not create the shortcut:', err.message);
    console.error('You can make one by hand — see "Starting it with no window at all" in README.md.');
    process.exit(1);
  }

  console.log(`Created: ${created}`);
  console.log('Double-click it to start the pet with no console window.');
  console.log('Right-click it → Pin to taskbar / Pin to Start if you want it handy.');
  console.log('The tray icon by the clock shows, hides and quits the pet.');
}

if (require.main === module) main();

module.exports = { buildScript, psQuote };
