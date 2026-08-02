# Desktop Pet

A companion pet that lives on your desktop. Drag it anywhere on screen, dress it
up, and keep using your computer normally — clicks pass straight through to
whatever is behind it.

Built on Electron, so the same code runs on **Windows** and **macOS**.

---

## What it does

- **Drag the pet anywhere.** The overlay covers the entire screen, so the pet can
  be parked in any corner — over the desktop, over a browser, over the taskbar.
- **Doesn't block anything.** The window is click-through everywhere except the
  pet itself. Desktop shortcuts, links, buttons and browser windows underneath
  stay fully clickable, even directly around the pet — hit-testing is done per
  pixel against the sprite's own shape, so the transparent parts of the pet's
  image are click-through too.
- **Two characters**, each dragged and dressed independently.
- **Dress Up + Outfit presets**, carried over from the pet template: layered
  clothing, colour tinting, girl/boy clothing rules, and one-tap preset outfits.
- **Multi-monitor.** Every display gets its own overlay and the pet slides
  between them as you drag. Plugging in or unplugging a monitor is handled live.
- **No stats.** No hunger, happiness or health — just the pet and its wardrobe.

---

## Running it

```bash
npm install
npm start
```

## Building installers

```bash
npm run build:win    # Windows: NSIS installer + portable .exe
npm run build:mac    # macOS: universal (Intel + Apple Silicon) .dmg and .zip
```

Output lands in `dist/`. Each platform's installer must be built on that
platform (or in CI) — electron-builder can't produce a signed macOS app from
Windows or vice versa.

> **macOS note:** the app is unsigned. On first launch, right-click it in
> Finder → **Open** to get past Gatekeeper. It runs as a menu-bar-only app
> (`LSUIElement`), so it has no Dock icon.

---

## Using it

| Action | How |
|---|---|
| Move a pet | Drag it |
| Select a pet | Click it — the wardrobe buttons move to it |
| Change clothes | **👗 Dress Up** under the selected pet |
| Apply a whole outfit | **🎀 Outfits** |
| Menu (dress up, hide, reset, quit) | Right-click the pet |
| Show/hide a pet, reset positions, quit | Tray icon |

The wardrobe buttons sit under the selected pet and flip above or beside it
automatically when the pet is near a screen edge.

---

## Adding artwork

Drop PNGs into `images/`. Everything is transparent art drawn at the same canvas
size as the base sprite so the layers line up.

**Base sprites**

| File | Who |
|---|---|
| `base.png` | Character 1 |
| `base_2.png` | Character 2 |

If `base_2.png` is missing, character 2 falls back to character 1's art with a
hue shift so the two are still distinguishable.

**Clothes** — add the PNG, then add its name to the matching list in
`outfit_config.js`. Character 2's art uses a `_2` suffix (`top1_2.png`).

```js
pet1: {
  top:    ["top1", "top2"],   // images/top1.png, images/top2.png
  bottom: ["pants1", "skirt1"],
},
```

Anything listed without a matching PNG is hidden automatically — no broken
images, no empty slots. That's why the wardrobe currently looks sparse: this
repo only ships `base.png`, `base_2.png` and `boxers1_2.png`. Add more art and
the categories appear on their own.

**Outfit presets** live in `outfit_presets.js`; a preset can give each character
a different look (character 1 in a dress, character 2 in top + pants).

---

## How it works

| File | Role |
|---|---|
| `main.js` | Electron main process: one transparent always-on-top overlay per display, shared pet state in global screen coordinates, tray, click-through toggling |
| `preload.js` | The only bridge between page and main (`contextIsolation` on, `nodeIntegration` off) |
| `pet_desktop.js` | The overlay scene: draws the pets, alpha hit-testing, dragging, dock placement, state sync |
| `outfit_system.js` | Dress Up panel, layering, colour tinting, clothing rules |
| `outfit_presets.js` | Preset outfits and the 🎀 Outfits panel |
| `outfit_config.js` | The wardrobe — the one file to edit when adding clothes |
| `asset_path_fix.js` | Resolves bare image names to `images/…` |

Two details worth knowing if you change things:

- **Pet positions are global screen coordinates.** Each overlay subtracts its own
  display origin when drawing, which is what lets a pet cross monitors mid-drag.
- **The app is served over a custom `pet://` scheme, not `file://`.** A `file://`
  page can't read pixels back out of a canvas that has a `file://` image drawn on
  it, and those pixel reads are exactly how click-through decides whether the
  cursor is on the pet. Loading over a registered standard scheme keeps
  `getImageData()` legal.
