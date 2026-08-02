# Desktop Pet

A companion pet that lives on your desktop. Drag it anywhere on screen, dress it
up, and keep using your computer normally — clicks pass straight through to
whatever is behind it.

Built on Electron, so the same code runs on **Windows** and **macOS**.

---

## What it does

- **Drag the pet anywhere.** The overlay covers the entire screen, so the pet can
  be parked in any corner — over the desktop, over a browser, over the taskbar.
- **Gravity.** Let go of a pet and it falls, squashes as it lands, and settles on
  the floor — the bottom of the work area, so it stands *on* the taskbar rather
  than behind it. Flick it and it keeps the momentum of the throw, bounces off
  the sides of the desktop and slides to a stop. Turn it off from the tray or the
  pet's right-click menu if you'd rather park a pet in mid-air.
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

### Getting the files

Grab the **whole repository**, not individual files:

- **Code → Download ZIP** on GitHub, then extract it, or
- `git clone https://github.com/Mygameindie/Computer-pet.git`

Downloading `start-pet.bat` on its own doesn't work: Chrome and Edge block every
`.bat` download by extension, before looking at what's inside — an empty batch
file gets refused too, and `.vbs` gets the same treatment. Inside a ZIP they
come through fine. After extracting, if Windows tagged the files as coming from
the internet, right-click `start-pet.bat` and `start-pet-hidden.vbs` →
Properties → tick **Unblock**.

### Starting it

**Windows** — double-click **`start-pet.bat`**. It installs dependencies on the
first run (a few minutes, it's fetching Electron) and launches the pet after
that. It needs [Node.js](https://nodejs.org) installed first; if it isn't, the
launcher tells you the one command to fix that.

That first run is the only one with a window worth looking at. After it, the
batch file hands straight over to `start-pet-hidden.vbs` and quits, so all you
see is a blink of a console as Windows opens and closes it. **Closing that
window does not close the pet**, and neither does the window closing itself:
the pet is started as a process with no console attached to it at all. Quit the
pet from the tray icon by the clock, or by right-clicking the pet.
Double-clicking the launcher again while the pet is already running won't give
you a second set of pets either; the app holds a single-instance lock and just
brings the existing ones back.

**macOS** — there's no double-clickable file in the box, because the Mac
equivalent of a `.bat` is a `.command`, and that opens a Terminal window and
keeps it open. Make a proper app instead — once, in Terminal, in this folder:

```bash
npm install
npm run shortcut
```

That puts a **Desktop Pet.app** on your desktop. Double-click it and the pet
starts with no Terminal window anywhere; drag it into `/Applications` or keep
it in the Dock. It points at this folder, so if you move the folder, run
`npm run shortcut` again. On macOS the pet is menu-bar-only — no Dock icon of
its own — and the icon by the clock shows, hides and quits it. (It needs
[Node.js](https://nodejs.org) too: `brew install node`.)

### Starting it with no window at all

*(Windows. On macOS the app above already opens nothing.)*

Not even a blink: **double-click `start-pet-hidden.vbs`** instead of the batch
file. It's the same launcher with its window hidden, so nothing appears on
screen — the pet just turns up, with its tray icon by the clock. If something
goes wrong it says so in a dialog and offers to run the launcher again in a
visible window, and on a first run (when there are minutes of install output to
show) it leaves the window visible on purpose.

Windows can't hide a `.bat` window itself — `cmd.exe` gets its console from
Windows before the script runs a single line — which is why the windowless
launcher is a separate `.vbs` file. Keep the two side by side in this folder;
each one needs the other.

If `.vbs` files are blocked on your machine (some workplaces switch Windows
Script Host off by policy), the batch file notices and stays as it is —
everything still works, you just get the console window back. The options below
avoid it another way.

**A desktop shortcut** — run this once:

```powershell
npm run shortcut
```

It puts a **Desktop Pet** shortcut on your desktop pointing straight at
Electron. Double-click it and the pet starts with no console window at all,
because Electron is a GUI program and has nothing to flash. Right-click the
shortcut → *Pin to taskbar* or *Pin to Start* and it behaves like any other
background app: an icon to click, and a tray icon by the clock to show, hide
and quit. (The same command on a Mac builds the `.app` described above —
same promise either way: something to double-click that opens no terminal.)

Or do it the long way:

**Build the app** (a real installed program with its own icon, rather than a
shortcut into this folder):

```powershell
npm run build:win
```

`dist\Desktop Pet 1.0.0.exe` is a portable build you can double-click or move
anywhere; the installer in the same folder puts it in the Start Menu. Neither
opens a console window, ever.

**Or make the shortcut by hand**, if `npm run shortcut` didn't work:

1. Right-click on the desktop → **New → Shortcut**
2. Location: `C:\path\to\Computer-pet\node_modules\electron\dist\electron.exe .`
   — note the space and dot at the end, that's the argument telling it which app
   to run
3. Name it *Desktop Pet* → Finish
4. Right-click the new shortcut → **Properties** → set **Start in** to
   `C:\path\to\Computer-pet`

Double-clicking that launches the pet directly, with no console and no batch
file in the way.

**Any platform** — from a terminal in this folder:

```bash
npm install
npm run start:bg     # start it and let go of it
```

`npm run start:bg` starts the pet in its own process with no console attached,
prints its pid, and exits. **Closing the terminal — PowerShell, Terminal, an SSH
session — leaves the pet running.** Quit it from the tray icon or the pet's
right-click menu.

```bash
npm start            # stays attached to this terminal
```

`npm start` is the one to use while changing the code: the pet dies with the
terminal, and you get the console output. Closing PowerShell after `npm start`
takes the pet with it — that's what `start:bg` is for.

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
| Throw a pet | Drag and let go while still moving |
| Select a pet | Click it — the wardrobe buttons move to it |
| Change clothes | **👗 Dress Up** under the selected pet |
| Apply a whole outfit | **🎀 Outfits** |
| Menu (dress up, gravity, hide, reset, quit) | Right-click the pet |
| Put the pets away / bring them back | **Click the tray icon** by the clock |
| Show one pet, gravity, reset positions, quit | Right-click the tray icon |

With every pet hidden the app is completely invisible — no pets, no wardrobe,
nothing in the taskbar — and it carries on running in the background. One click
on the tray icon brings it all back.

The wardrobe bar is pinned to the top of the screen and the panels drop down
from it — pets get dragged, thrown and dropped, and a bar that travels with them
is a moving target. The bar names the pet it is currently dressing (click a pet
to switch), and on a multi-monitor setup it appears on the screen that pet is
standing on. Only one of the two panels is open at a time.

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
| `main.js` | Electron main process: one transparent always-on-top overlay per display, shared pet state in global screen coordinates, the gravity simulation, tray, click-through toggling |
| `preload.js` | The only bridge between page and main (`contextIsolation` on, `nodeIntegration` off) |
| `pet_desktop.js` | The overlay scene: draws the pets, alpha hit-testing, dragging and throwing, which screen shows the wardrobe bar, state sync |
| `outfit_system.js` | Dress Up panel, layering, colour tinting, clothing rules |
| `outfit_presets.js` | Preset outfits and the 🎀 Outfits panel |
| `outfit_config.js` | The wardrobe — the one file to edit when adding clothes |
| `asset_path_fix.js` | Resolves bare image names to `images/…` |
| `start-pet.bat` | Windows one-click launcher: installs on first run, then hands over to the windowless launcher |
| `start-pet-hidden.vbs` | Runs `start-pet.bat` with its window hidden — double-click this to start the pet with nothing on screen |
| `scripts/start-detached.js` | `npm run start:bg` — launches the app detached so it outlives the terminal |
| `scripts/make-shortcut.js` | `npm run shortcut` — a Windows shortcut that starts the pet with no console window |
| `scripts/make-app.js` | the macOS half of `npm run shortcut` — a `Desktop Pet.app` that starts the pet with no Terminal window |

Three details worth knowing if you change things:

- **Pet positions are global screen coordinates.** Each overlay subtracts its own
  display origin when drawing, which is what lets a pet cross monitors mid-drag.
- **Gravity runs in the main process, not the renderer.** Main owns the
  positions, so it is the only place that can integrate them once and have every
  monitor agree. The renderer only reports what the cursor did (grab, move,
  release-with-velocity) and draws the result. The simulation timer stops as soon
  as every pet is asleep on the floor, so an idle pet costs nothing — and because
  state is broadcast on every physics frame while a pet is falling, anything
  listening to it must be cheap and must not rebuild the wardrobe UI.
- **The app is served over a custom `pet://` scheme, not `file://`.** A `file://`
  page can't read pixels back out of a canvas that has a `file://` image drawn on
  it, and those pixel reads are exactly how click-through decides whether the
  cursor is on the pet. Loading over a registered standard scheme keeps
  `getImageData()` legal.
