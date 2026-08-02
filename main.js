// ===========================================================
// 🖥️ main.js — desktop pet shell
// ===========================================================
// One transparent, always-on-top overlay window per display. Every window
// renders the SAME scene, offset by its own display origin, so a pet dragged
// off the right edge of one monitor slides onto the next one seamlessly.
//
// The main process owns all shared state (pet positions in global screen
// coordinates, what each pet is wearing, which pet is selected). Renderers are
// views: they send changes here, and every window gets the merged result back.
//
// Windows start click-through — `setIgnoreMouseEvents(true, { forward: true })`
// — so the desktop, icons and browser underneath stay fully clickable. The
// renderer flips it off only while the cursor is over an opaque pet pixel or
// over the wardrobe UI. See pet_desktop.js.
// ===========================================================

const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_DIR = __dirname;
const PET_COUNT = 2;

// Custom scheme instead of file:// — a file:// page can't read pixels back out
// of a canvas that has a file:// image drawn on it (Chromium taints it), and
// pixel reads are exactly how click-through hit-testing works. A registered
// standard scheme is a real origin, so getImageData() stays legal.
protocol.registerSchemesAsPrivileged([
  { scheme: 'pet', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** @type {Map<number, BrowserWindow>} display id -> overlay window */
const windows = new Map();
let tray = null;
let quitting = false;

// ---- Shared state --------------------------------------------------------
// Pet x/y are GLOBAL screen coordinates (top-left of the pet box), so they are
// meaningful across every monitor. Each window subtracts its display origin.
const state = {
  pets: [
    { x: 0, y: 0, visible: true },
    { x: 0, y: 0, visible: true },
  ],
  activePet: 0,
  // Filled in by the renderer once the outfit system has built its defaults.
  outfit: null,
  ui: { dressupOpen: false, presetsOpen: false },
};

function displayArea() {
  // Union of every display, in global screen coordinates.
  const ds = screen.getAllDisplays();
  const left = Math.min(...ds.map(d => d.bounds.x));
  const top = Math.min(...ds.map(d => d.bounds.y));
  const right = Math.max(...ds.map(d => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...ds.map(d => d.bounds.y + d.bounds.height));
  return { left, top, right, bottom };
}

function defaultPetPosition(index) {
  const d = screen.getPrimaryDisplay().workArea;
  const w = 220, h = 290;
  return {
    x: Math.round(d.x + d.width - (w + 30) * (index + 1)),
    y: Math.round(d.y + d.height - h - 20),
  };
}

function resetPositions() {
  state.pets.forEach((p, i) => {
    const { x, y } = defaultPetPosition(i);
    p.x = x; p.y = y;
  });
  broadcast();
}

// Keep a dragged pet somewhere reachable: its centre must stay on a real
// display, otherwise it could be parked in the gap between two monitors.
function clampPet(pet) {
  const a = displayArea();
  pet.x = Math.max(a.left - 60, Math.min(pet.x, a.right - 60));
  pet.y = Math.max(a.top - 20, Math.min(pet.y, a.bottom - 60));
}

function broadcast() {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.webContents.send('state', state);
  }
}

// ---- Overlay windows -----------------------------------------------------
function createWindowForDisplay(display) {
  const { x, y, width, height } = display.bounds; // full bounds: cover the whole screen

  const win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    // `type: 'toolbar'` keeps the overlay out of the window switcher on Windows
    ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    // Float above other apps and follow the user across Spaces / fullscreen apps
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Start fully click-through. { forward: true } keeps mousemove flowing to the
  // renderer so it can detect the cursor entering the pet and hand control back.
  win.setIgnoreMouseEvents(true, { forward: true });

  const q = new URLSearchParams({
    originX: String(x), originY: String(y),
    width: String(width), height: String(height),
    displayId: String(display.id),
  });
  win.loadURL(`pet://app/index.html?${q.toString()}`);

  win.once('ready-to-show', () => {
    win.showInactive(); // never steal focus from what the user is working in
    win.webContents.send('state', state);
  });

  win.on('closed', () => windows.delete(display.id));
  windows.set(display.id, win);
  return win;
}

function syncWindowsToDisplays() {
  const displays = screen.getAllDisplays();
  const liveIds = new Set(displays.map(d => d.id));

  // Drop windows for displays that went away
  for (const [id, win] of [...windows.entries()]) {
    if (!liveIds.has(id)) {
      windows.delete(id);
      if (!win.isDestroyed()) win.destroy();
    }
  }

  // Add windows for new displays; resize the ones that moved or changed size
  for (const d of displays) {
    const win = windows.get(d.id);
    if (!win || win.isDestroyed()) {
      createWindowForDisplay(d);
    } else {
      win.setBounds(d.bounds);
      win.webContents.send('origin', {
        originX: d.bounds.x, originY: d.bounds.y,
        width: d.bounds.width, height: d.bounds.height,
      });
    }
  }

  state.pets.forEach(clampPet);
  broadcast();
}

// ---- Tray ----------------------------------------------------------------
function trayIcon() {
  // Reuse the pet's own art so there's no extra asset to ship.
  const p = path.join(APP_DIR, 'images', 'base.png');
  try {
    if (fs.existsSync(p)) {
      const im = nativeImage.createFromPath(p);
      if (!im.isEmpty()) return im.resize({ width: 20, height: 20 });
    }
  } catch (_) { /* fall through */ }
  return nativeImage.createEmpty();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Desktop Pet', enabled: false },
    { type: 'separator' },
    ...state.pets.map((pet, i) => ({
      label: `Show Pet ${i + 1}`,
      type: 'checkbox',
      checked: pet.visible,
      click: () => {
        pet.visible = !pet.visible;
        if (pet.visible) clampPet(pet);
        tray.setContextMenu(buildTrayMenu());
        broadcast();
      },
    })),
    { type: 'separator' },
    { label: 'Reset Positions', click: resetPositions },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  // Some Linux desktops have no system tray at all; the pet's own right-click
  // menu still covers everything the tray offers, so don't let this be fatal.
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip('Desktop Pet');
    tray.setContextMenu(buildTrayMenu());
  } catch (err) {
    console.warn('Tray unavailable:', err.message);
    tray = null;
  }
}

// ---- App lifecycle -------------------------------------------------------
app.whenReady().then(() => {
  // Serve the app directory over the privileged `pet:` scheme.
  protocol.handle('pet', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.normalize(path.join(APP_DIR, rel));
    // Never serve outside the app directory.
    if (target !== APP_DIR && !target.startsWith(APP_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    // net.fetch (not the global fetch) is the one that can read file: URLs.
    // A miss is normal and expected: outfit_config.js lists every garment the
    // wardrobe *can* have, and the outfit system hides the ones whose PNG isn't
    // there yet. Answer 404 so the image's onerror fires quietly.
    return net.fetch(pathToFileURL(target).toString())
      .catch(() => new Response('Not found', { status: 404 }));
  });

  resetPositions();
  syncWindowsToDisplays();
  createTray();

  screen.on('display-added', syncWindowsToDisplays);
  screen.on('display-removed', syncWindowsToDisplays);
  screen.on('display-metrics-changed', syncWindowsToDisplays);

  app.on('activate', () => { if (windows.size === 0) syncWindowsToDisplays(); });
});

// The overlay windows ARE the app — closing them all means quitting, but we
// never close them ourselves, so this only fires on a real quit.
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; });

// ---- IPC -----------------------------------------------------------------

// Per-window click-through toggle. Each window decides for itself, because only
// the window under the cursor sees the pet at that moment.
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

// A renderer moved a pet (global screen coordinates) — clamp and fan out.
ipcMain.on('move-pet', (event, { index, x, y }) => {
  const pet = state.pets[index];
  if (!pet) return;
  pet.x = Math.round(x);
  pet.y = Math.round(y);
  clampPet(pet);
  broadcast();
});

// Outfit / selection / panel state changed in one window — merge and fan out.
ipcMain.on('patch-state', (event, patch) => {
  if (!patch || typeof patch !== 'object') return;
  if (patch.outfit) state.outfit = patch.outfit;
  if (typeof patch.activePet === 'number') state.activePet = patch.activePet;
  if (patch.ui) Object.assign(state.ui, patch.ui);
  broadcast();
});

ipcMain.on('hide-pet', (event, index) => {
  const pet = state.pets[index];
  if (!pet) return;
  pet.visible = false;
  if (tray) tray.setContextMenu(buildTrayMenu());
  broadcast();
});

ipcMain.on('quit-app', () => { quitting = true; app.quit(); });

// Right-click on a pet — a native menu, since there's no window chrome.
ipcMain.on('pet-context-menu', (event, index) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  Menu.buildFromTemplate([
    { label: `Pet ${index + 1}`, enabled: false },
    { type: 'separator' },
    { label: 'Dress Up…', click: () => event.sender.send('command', { name: 'open-dressup', index }) },
    { label: 'Outfits…', click: () => event.sender.send('command', { name: 'open-presets', index }) },
    { type: 'separator' },
    { label: 'Reset Positions', click: resetPositions },
    { label: 'Hide This Pet', click: () => {
      const pet = state.pets[index];
      if (pet) { pet.visible = false; if (tray) tray.setContextMenu(buildTrayMenu()); broadcast(); }
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]).popup({ window: win });
});
