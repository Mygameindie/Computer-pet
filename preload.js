// Bridge between the overlay renderer and the main process.
// contextIsolation is on and nodeIntegration is off, so this is the only
// surface the page can reach — nothing else from Node is exposed.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // Click-through: true = clicks pass to whatever is behind the overlay
  // (desktop icons, browser, taskbar). Flipped to false only while the cursor
  // is over an opaque pet pixel or the wardrobe UI.
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', !!ignore),

  // Pet position in GLOBAL screen coordinates, so it can cross monitors.
  movePet: (index, x, y) => ipcRenderer.send('move-pet', { index, x, y }),

  // Outfit / active-pet / panel state, merged in main and mirrored to every window.
  patchState: (patch) => ipcRenderer.send('patch-state', patch),

  hidePet: (index) => ipcRenderer.send('hide-pet', index),
  quit: () => ipcRenderer.send('quit-app'),
  petContextMenu: (index) => ipcRenderer.send('pet-context-menu', index),

  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onOrigin: (cb) => ipcRenderer.on('origin', (_e, o) => cb(o)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
});
