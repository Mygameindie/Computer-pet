#!/usr/bin/env node
// ===========================================================
// 🚀 scripts/start-detached.js — start the pet, then let go of it
// ===========================================================
// `npm start` runs Electron as a child of your terminal, so closing that
// terminal (PowerShell, Terminal, an SSH session) takes the pet with it. This
// starts the same app in its own process group with no console attached, then
// exits — the pet stays up until you quit it from the tray or the pet's
// right-click menu.
//
//   npm run start:bg
//
// Windows users double-clicking start-pet.bat get this for free; that script
// does the same thing with `start`.
// ===========================================================

const { spawn } = require('child_process');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');

// Required from outside Electron, the `electron` package exports the path to
// its own binary.
let electronPath;
try {
  electronPath = require('electron');
} catch (_) { /* not installed */ }

if (typeof electronPath !== 'string' || !electronPath) {
  console.error('Electron is not installed yet. Run `npm install` in this folder first.');
  process.exit(1);
}

// Anything after `--` is passed straight through to Electron:
//   npm run start:bg -- --disable-gpu
const child = spawn(electronPath, [APP_DIR, ...process.argv.slice(2)], {
  // detached: its own process group, and on Windows no inherited console — so
  // closing the terminal doesn't signal it.
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

child.on('error', (err) => {
  console.error('Could not start the pet:', err.message);
  process.exit(1);
});

// Stop Node from waiting on the child, so this process can exit right away.
child.unref();

console.log(`Desktop Pet started (pid ${child.pid}).`);
console.log('You can close this terminal — the pet keeps running.');
console.log('To quit it: right-click a pet, or use the tray icon.');
