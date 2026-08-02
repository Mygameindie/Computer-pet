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
//
// Gravity lives here too, not in the renderer: the main process owns the pet
// positions, so it is the only place that can integrate them once and have
// every monitor's overlay agree on where the pet is.
// ===========================================================

const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_DIR = __dirname;
const PET_COUNT = 2;

// Only one pet app at a time. The launcher now starts the app detached, so it
// keeps running after its window is closed — which means it is easy to
// double-click the launcher again and end up with two sets of pets on screen.
// The second instance just un-hides the pets of the first one and exits.
const HAS_INSTANCE_LOCK = app.requestSingleInstanceLock();
if (!HAS_INSTANCE_LOCK) app.quit();

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
let droppedIn = false;   // have the pets made their entrance yet?

// ---- Shared state --------------------------------------------------------
// Pet x/y are GLOBAL screen coordinates (top-left of the pet box), so they are
// meaningful across every monitor. Each window subtracts its display origin.
// vx/vy are px per second and are integrated by the physics loop below; w/h
// start as a guess and are replaced by the real drawn size the first time a
// renderer measures its sprite (see the 'pet-size' IPC).
const state = {
  pets: [
    { x: 0, y: 0, vx: 0, vy: 0, w: 220, h: 250, visible: true, dragging: false, landedAt: 0, impact: 0 },
    { x: 0, y: 0, vx: 0, vy: 0, w: 220, h: 250, visible: true, dragging: false, landedAt: 0, impact: 0 },
  ],
  activePet: 0,
  gravity: true,
  // Filled in by the renderer once the outfit system has built its defaults.
  // outfitRev is bumped on every change so a renderer can tell "the wardrobe
  // changed" from "this is just another physics frame" without diffing.
  outfit: null,
  outfitRev: 0,
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

// The display a pet is standing on, picked from its centre so a pet straddling
// two monitors belongs to the one it is mostly on.
function displayFor(pet) {
  return screen.getDisplayNearestPoint({
    x: Math.round(pet.x + pet.w / 2),
    y: Math.round(pet.y + pet.h / 2),
  });
}

// The floor: the bottom of the work area, so the pet stands ON the taskbar/dock
// rather than behind it. Returned as the pet's top-left y when it is grounded.
function groundY(pet) {
  const wa = displayFor(pet).workArea;
  return wa.y + wa.height - pet.h;
}

function defaultPetPosition(index) {
  const d = screen.getPrimaryDisplay().workArea;
  const pet = state.pets[index] || { w: 220 };
  return {
    x: Math.round(d.x + d.width - (pet.w + 30) * (index + 1)),
    y: Math.round(d.y + 40),   // drop in from the top — gravity does the rest
  };
}

function resetPositions() {
  state.pets.forEach((p, i) => {
    const { x, y } = defaultPetPosition(i);
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
  });
  clampAll();
  wakePhysics();
  broadcast();
}

// Keep a pet reachable: fully inside the union of the displays, and never below
// the floor of whichever display it is on.
function clampPet(pet) {
  const a = displayArea();
  pet.x = Math.max(a.left, Math.min(pet.x, a.right - pet.w));
  pet.y = Math.max(a.top, Math.min(pet.y, groundY(pet)));
}

function clampAll() {
  state.pets.forEach(clampPet);
}

// ---- Gravity -------------------------------------------------------------
// A tiny fixed-step simulation. It only runs while something is actually
// moving: once every pet is asleep on the floor the timer stops, so an idle
// pet costs exactly nothing.
const GRAVITY = 2600;        // px/s² — a screen-height fall takes about half a second
const BOUNCE = 0.34;         // share of downward speed kept when it hits the floor
const BOUNCE_CUTOFF = 240;   // px/s — land slower than this and it just stops
const WALL_BOUNCE = 0.45;    // same, for the left/right edges of the desktop
const GROUND_FRICTION = 5.5; // e-folds per second while sliding along the floor
const AIR_DRAG = 0.35;       // ditto, in the air — a throw keeps most of its speed
const STOP_SPEED = 20;       // px/s — slower than this on the floor is "stopped"
const MAX_THROW = 3200;      // px/s — cap on how hard a flick can launch a pet
const MAX_STEP = 0.05;       // never integrate more than 50 ms in one go
const TICK_MS = 16;

let physicsTimer = null;
let lastTick = 0;

function wakePhysics() {
  if (physicsTimer || !state.gravity) return;
  lastTick = Date.now();
  physicsTimer = setInterval(stepPhysics, TICK_MS);
}

function sleepPhysics() {
  if (!physicsTimer) return;
  clearInterval(physicsTimer);
  physicsTimer = null;
}

// Gravity off = the pet floats wherever you put it, which is the old behaviour
// and is genuinely handy if you like it parked halfway up the screen.
function setGravity(on) {
  state.gravity = !!on;
  if (!state.gravity) {
    sleepPhysics();
    state.pets.forEach(p => { p.vx = 0; p.vy = 0; });
  } else {
    wakePhysics();
  }
  broadcast();
}

// Exponential damping that doesn't change character with the frame rate.
function damp(v, rate, dt) {
  return v * Math.exp(-rate * dt);
}

function stepPhysics() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, MAX_STEP);
  lastTick = now;
  if (dt <= 0) return;

  const area = displayArea();
  let moved = false;
  let busy = false;

  for (const pet of state.pets) {
    // A pet held by the cursor hangs in the air; it falls when you let go.
    if (!pet.visible || pet.dragging) continue;

    const floor = groundY(pet);
    const airborne = pet.y < floor - 0.5;
    if (!airborne && pet.vx === 0 && pet.vy === 0) continue;   // asleep

    if (airborne) pet.vy += GRAVITY * dt;

    pet.x += pet.vx * dt;
    pet.y += pet.vy * dt;

    // Side walls of the whole desktop, so a thrown pet bounces back into view.
    const minX = area.left;
    const maxX = area.right - pet.w;
    if (pet.x < minX) { pet.x = minX; pet.vx = Math.abs(pet.vx) * WALL_BOUNCE; }
    else if (pet.x > maxX) { pet.x = maxX; pet.vx = -Math.abs(pet.vx) * WALL_BOUNCE; }

    // Recompute the floor: a sideways bounce may have moved it to another
    // monitor whose work area ends somewhere else.
    const landing = groundY(pet);
    if (pet.y >= landing) {
      const hit = pet.vy;
      pet.y = landing;
      if (hit > BOUNCE_CUTOFF) {
        pet.vy = -hit * BOUNCE;
      } else if (hit > 0) {
        pet.vy = 0;
      }
      if (hit > BOUNCE_CUTOFF / 2) {
        // Tell the renderers to squash the sprite; strength scales with impact.
        pet.landedAt = now;
        pet.impact = Math.min(1, hit / 1800);
      }
      pet.vx = damp(pet.vx, GROUND_FRICTION, dt);
      if (Math.abs(pet.vx) < STOP_SPEED) pet.vx = 0;
      if (Math.abs(pet.vy) < STOP_SPEED) pet.vy = 0;
    } else {
      pet.vx = damp(pet.vx, AIR_DRAG, dt);
      // Don't let a hard upward flick throw the pet off the top of the desktop.
      if (pet.y < area.top) { pet.y = area.top; if (pet.vy < 0) pet.vy = 0; }
    }

    moved = true;
    if (pet.y < groundY(pet) - 0.5 || pet.vx !== 0 || pet.vy !== 0) busy = true;
  }

  if (moved) broadcast();
  if (!busy) sleepPhysics();
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
    // Drop the pets in only once there is something to watch them fall onto;
    // starting the fall before the first overlay is visible would just mean
    // finding them already sitting on the floor.
    if (!droppedIn) { droppedIn = true; resetPositions(); }
    win.webContents.send('state', state);
  });

  win.on('closed', () => {
    windows.delete(display.id);
    // The window that was holding a pet is gone; don't leave it stuck mid-air.
    state.pets.forEach(p => { p.dragging = false; });
    wakePhysics();
  });
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

  // A monitor that appeared, vanished or resized moves the floor: re-settle.
  clampAll();
  wakePhysics();
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
        if (pet.visible) { clampPet(pet); wakePhysics(); }
        tray.setContextMenu(buildTrayMenu());
        broadcast();
      },
    })),
    { type: 'separator' },
    {
      label: 'Gravity',
      type: 'checkbox',
      checked: state.gravity,
      click: () => { setGravity(!state.gravity); if (tray) tray.setContextMenu(buildTrayMenu()); },
    },
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
// Someone double-clicked the launcher while the pet was already running (very
// easy now that it survives the launcher window closing): bring the pets back
// instead of starting a second set.
app.on('second-instance', () => {
  state.pets.forEach(p => { p.visible = true; clampPet(p); });
  if (tray) tray.setContextMenu(buildTrayMenu());
  wakePhysics();
  broadcast();
});

app.whenReady().then(() => {
  if (!HAS_INSTANCE_LOCK) return;

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

// The renderer measured its sprite. The real drawn size decides where the floor
// is and how far right a pet may go, so adopt it and re-settle.
ipcMain.on('pet-size', (event, { index, w, h }) => {
  const pet = state.pets[index];
  if (!pet || !(w > 0) || !(h > 0)) return;
  if (Math.abs(pet.w - w) < 0.5 && Math.abs(pet.h - h) < 0.5) return;
  pet.w = w;
  pet.h = h;
  clampPet(pet);
  wakePhysics();
  broadcast();
});

// Drag started — the pet hangs off the cursor, so physics leaves it alone.
ipcMain.on('grab-pet', (event, index) => {
  const pet = state.pets[index];
  if (!pet) return;
  pet.dragging = true;
  pet.vx = 0;
  pet.vy = 0;
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

// Let go — hand the flick velocity to the simulation so the pet keeps the
// momentum of the throw and then falls.
ipcMain.on('drop-pet', (event, { index, vx, vy }) => {
  const pet = state.pets[index];
  if (!pet) return;
  pet.dragging = false;
  const clamp = v => Math.max(-MAX_THROW, Math.min(Number(v) || 0, MAX_THROW));
  pet.vx = state.gravity ? clamp(vx) : 0;
  pet.vy = state.gravity ? clamp(vy) : 0;
  wakePhysics();
  broadcast();
});

// Outfit / selection / panel state changed in one window — merge and fan out.
ipcMain.on('patch-state', (event, patch) => {
  if (!patch || typeof patch !== 'object') return;
  if (patch.outfit) { state.outfit = patch.outfit; state.outfitRev++; }
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
    {
      label: 'Gravity',
      type: 'checkbox',
      checked: state.gravity,
      click: () => { setGravity(!state.gravity); if (tray) tray.setContextMenu(buildTrayMenu()); },
    },
    { label: 'Reset Positions', click: resetPositions },
    { label: 'Hide This Pet', click: () => {
      const pet = state.pets[index];
      if (pet) { pet.visible = false; if (tray) tray.setContextMenu(buildTrayMenu()); broadcast(); }
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]).popup({ window: win });
});
