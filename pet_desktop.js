// ===========================================================
// 🐾 pet_desktop.js — the overlay scene (one instance per display)
// ===========================================================
// Every overlay window runs this file and renders the SAME two pets. What
// differs is the window's display origin: a pet at global screen position
// (3000, 400) draws at x = 3000 - originX, so it appears on exactly one
// monitor and slides between them while you drag.
//
// Click-through is the important part: the window ignores mouse events by
// default, so the desktop, icons, taskbar and browser underneath stay
// clickable. We only take control back while the cursor is over an opaque
// pixel of the pet sprite (alpha hit-test, not the bounding box — the
// transparent corners of the image stay click-through) or over the wardrobe UI.
// ===========================================================

(() => {
  const api = window.petAPI;
  const PET_COUNT = 2;
  const PET_HEIGHT = 250;          // drawn height in CSS pixels
  const FALLBACK_ASPECT = 400 / 450;
  const ALPHA_THRESHOLD = 10;      // a pixel counts as "the pet" above this alpha

  // Base art per character. Character 2 falls back to character 1's art with a
  // hue shift, matching the pet template's behaviour when _2 art is missing.
  const BASE_SRC = ['images/base.png', 'images/base_2.png'];
  const FALLBACK_FILTER = 'hue-rotate(140deg) saturate(1.2)';

  // ---- Window origin ------------------------------------------------------
  const params = new URLSearchParams(location.search);
  let origin = {
    x: Number(params.get('originX')) || 0,
    y: Number(params.get('originY')) || 0,
    w: Number(params.get('width')) || window.innerWidth,
    h: Number(params.get('height')) || window.innerHeight,
  };

  // ---- Local mirror of the shared state ----------------------------------
  let shared = {
    pets: [{ x: 0, y: 0, visible: true }, { x: 0, y: 0, visible: true }],
    activePet: 0,
    outfit: null,
    ui: { dressupOpen: false, presetsOpen: false },
  };
  let applyingRemote = false;   // guards against echoing state back to main

  // ---- DOM ---------------------------------------------------------------
  const dock = document.getElementById('wardrobe-dock');
  const dressBtn = document.getElementById('dressup-btn');
  const presetBtn = document.getElementById('preset-btn');
  const dressPanel = document.getElementById('dressup-panel');
  const presetPanel = document.getElementById('preset-panel');

  const pets = [];
  for (let i = 0; i < PET_COUNT; i++) {
    const el = document.getElementById('pet-' + i);
    const canvas = el.querySelector('.pet-canvas');
    pets.push({
      index: i,
      el,
      canvas,
      ctx: canvas.getContext('2d', { willReadFrequently: true }),
      img: null,
      usingFallbackArt: false,
      w: PET_HEIGHT * FALLBACK_ASPECT,
      h: PET_HEIGHT,
    });
  }

  // ---- Art loading --------------------------------------------------------
  function loadBase(pet) {
    const im = new Image();
    im.onload = () => { sizePet(pet); requestRedraw(); };
    im.onerror = () => {
      // No art for character 2 — reuse character 1's and tint it so the two
      // pets are still visually distinct.
      if (pet.index === 1 && !pet.usingFallbackArt) {
        pet.usingFallbackArt = true;
        pet.img = null;
        const alt = new Image();
        alt.onload = () => { pet.img = alt; sizePet(pet); requestRedraw(); };
        alt.src = BASE_SRC[0];
        return;
      }
      pet.img = null;
      requestRedraw();
    };
    im.src = BASE_SRC[pet.index] || BASE_SRC[0];
    pet.img = im;
  }

  function sizePet(pet) {
    const im = pet.img;
    const aspect = (im && im.naturalWidth && im.naturalHeight)
      ? im.naturalWidth / im.naturalHeight
      : FALLBACK_ASPECT;
    pet.h = PET_HEIGHT;
    pet.w = Math.round(PET_HEIGHT * aspect);

    // Back the canvas at device resolution so the sprite stays crisp on HiDPI
    // and Retina screens, but keep the CSS box in layout pixels.
    const dpr = window.devicePixelRatio || 1;
    pet.canvas.width = Math.round(pet.w * dpr);
    pet.canvas.height = Math.round(pet.h * dpr);
    pet.canvas.style.width = pet.w + 'px';
    pet.canvas.style.height = pet.h + 'px';
    pet.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  pets.forEach(pet => { sizePet(pet); loadBase(pet); });

  // ---- Drawing ------------------------------------------------------------
  let redrawQueued = false;
  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => { redrawQueued = false; drawAll(); });
  }

  function drawAll() {
    pets.forEach(pet => {
      const { ctx } = pet;
      ctx.clearRect(0, 0, pet.w, pet.h);
      if (!shared.pets[pet.index] || !shared.pets[pet.index].visible) return;

      ctx.save();
      ctx.filter = pet.usingFallbackArt ? FALLBACK_FILTER : 'none';
      if (pet.img && pet.img.complete && pet.img.naturalWidth) {
        ctx.drawImage(pet.img, 0, 0, pet.w, pet.h);
      }
      ctx.restore();

      // Clothes on top, layered by z and tinted, straight from the outfit system.
      if (typeof window.drawOutfitOverlay === 'function') {
        window.drawOutfitOverlay(ctx, 'stand', 0, 0, pet.w, pet.h, pet.index);
      }
    });
  }

  // Re-draw whenever a clothing image finishes loading.
  window.addEventListener('outfit:art-changed', requestRedraw);

  // ---- Layout -------------------------------------------------------------
  function layout() {
    pets.forEach(pet => {
      const s = shared.pets[pet.index];
      if (!s || !s.visible) { pet.el.style.display = 'none'; return; }
      pet.el.style.display = 'flex';
      pet.el.style.left = (s.x - origin.x) + 'px';
      pet.el.style.top = (s.y - origin.y) + 'px';
    });
    placeDock();
  }

  // The dock lives inside the selected pet's container so it travels with it.
  function placeDock() {
    const active = pets[shared.activePet] || pets[0];
    const visible = shared.pets[active.index] && shared.pets[active.index].visible;
    if (!visible) { dock.style.display = 'none'; return; }
    if (dock.parentElement !== active.el) active.el.appendChild(dock);
    dock.style.display = 'flex';

    // Keep the wardrobe on screen wherever the pet is parked — measure the dock
    // rather than guessing, since its height depends on which panel is open.
    const petTop = shared.pets[active.index].y - origin.y;
    const petLeft = shared.pets[active.index].x - origin.x;
    const dockH = dock.offsetHeight || 44;
    const dockW = dock.offsetWidth || 200;

    const spaceBelow = origin.h - (petTop + active.h);
    dock.classList.toggle('flip-up', spaceBelow < dockH + 8 && petTop > dockH + 8);

    const spaceRight = origin.w - petLeft;
    dock.classList.toggle('flip-left', spaceRight < dockW + 8 && petLeft + active.w > dockW + 8);
  }

  // ---- Click-through ------------------------------------------------------
  // The window ignores mouse events by default; mousemove is still forwarded to
  // us, which is what lets this run at all. We hand interaction back only for
  // the pixels that are actually the pet, or for the wardrobe UI.
  let ignoring = true;
  function setIgnore(next) {
    if (next === ignoring) return;   // don't spam IPC on every mousemove
    ignoring = next;
    api.setIgnoreMouseEvents(next);
  }

  function opaqueAt(pet, cx, cy) {
    if (cx < 0 || cy < 0 || cx >= pet.w || cy >= pet.h) return false;
    const dpr = window.devicePixelRatio || 1;
    try {
      const d = pet.ctx.getImageData(Math.floor(cx * dpr), Math.floor(cy * dpr), 1, 1).data;
      return d[3] > ALPHA_THRESHOLD;
    } catch (_) {
      // Canvas unexpectedly tainted — fall back to an inset bounding box so the
      // pet stays draggable rather than becoming impossible to grab.
      const m = 0.12;
      return cx > pet.w * m && cx < pet.w * (1 - m) && cy > pet.h * m && cy < pet.h * (1 - m);
    }
  }

  function petUnderCursor(clientX, clientY) {
    // Front-to-back: the selected pet wins when the two overlap.
    const order = [shared.activePet, ...pets.map(p => p.index).filter(i => i !== shared.activePet)];
    for (const i of order) {
      const pet = pets[i];
      const s = shared.pets[i];
      if (!s || !s.visible) continue;
      const r = pet.canvas.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      if (opaqueAt(pet, clientX - r.left, clientY - r.top)) return pet;
    }
    return null;
  }

  function overDock(clientX, clientY) {
    if (dock.style.display === 'none') return false;
    const el = document.elementFromPoint(clientX, clientY);
    return !!(el && dock.contains(el));
  }

  document.addEventListener('mousemove', (e) => {
    if (drag.active) { setIgnore(false); return; }
    const interactive = !!petUnderCursor(e.clientX, e.clientY) || overDock(e.clientX, e.clientY);
    setIgnore(!interactive);
  });

  // Cursor left this monitor entirely — go back to click-through.
  document.addEventListener('mouseleave', () => { if (!drag.active) setIgnore(true); });

  // ---- Dragging -----------------------------------------------------------
  // Offsets are kept in global screen coordinates so a drag that starts on one
  // monitor keeps working after the cursor crosses onto another.
  const drag = { active: false, index: -1, dx: 0, dy: 0, pointerId: null };

  function globalFromClient(clientX, clientY) {
    return { x: clientX + origin.x, y: clientY + origin.y };
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;                    // right-click opens the menu
    const pet = petUnderCursor(e.clientX, e.clientY);
    if (!pet) return;

    selectPet(pet.index);

    const g = globalFromClient(e.clientX, e.clientY);
    const s = shared.pets[pet.index];
    drag.active = true;
    drag.index = pet.index;
    drag.dx = g.x - s.x;
    drag.dy = g.y - s.y;
    drag.pointerId = e.pointerId;

    pet.el.classList.add('dragging');
    // Pointer capture keeps move/up events coming to this window even after the
    // cursor leaves it — that's what allows dragging onto another display.
    try { pet.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag.active || (drag.pointerId !== null && e.pointerId !== drag.pointerId)) return;
    const g = globalFromClient(e.clientX, e.clientY);
    const x = g.x - drag.dx;
    const y = g.y - drag.dy;

    // Move locally right away so the drag feels attached to the cursor; main
    // clamps and mirrors the position to the other windows.
    shared.pets[drag.index].x = x;
    shared.pets[drag.index].y = y;
    layout();
    api.movePet(drag.index, x, y);
    e.preventDefault();
  });

  function endDrag(e) {
    if (!drag.active) return;
    const pet = pets[drag.index];
    if (pet) {
      pet.el.classList.remove('dragging');
      try { if (e && drag.pointerId !== null) pet.canvas.releasePointerCapture(drag.pointerId); } catch (_) {}
    }
    drag.active = false;
    drag.index = -1;
    drag.pointerId = null;
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // ---- Right-click menu ---------------------------------------------------
  document.addEventListener('contextmenu', (e) => {
    const pet = petUnderCursor(e.clientX, e.clientY);
    if (!pet) return;
    e.preventDefault();
    selectPet(pet.index);
    api.petContextMenu(pet.index);
  });

  // ---- Selection + outfit state sync -------------------------------------
  // The Dress Up panel has its own "Character 1 / Character 2" buttons that call
  // setActivePet directly, so wrap it once instead of trying to catch every
  // caller — the dock follows the selection wherever it comes from.
  const _setActivePet = window.setActivePet;
  window.setActivePet = function (index) {
    if (typeof _setActivePet === 'function') _setActivePet(index);
    shared.activePet = (index === 0 || index === 1) ? index : 0;
    placeDock();
    requestRedraw();
    if (!applyingRemote) api.patchState({ activePet: shared.activePet });
  };

  function selectPet(index) {
    window.setActivePet(index);
  }

  function currentOutfit() {
    return {
      selectedClothes: JSON.parse(JSON.stringify(window.selectedClothes || [])),
      clothingColors: JSON.parse(JSON.stringify(window.clothingColors || [])),
    };
  }

  function pushOutfit() {
    if (applyingRemote) return;
    api.patchState({
      outfit: currentOutfit(),
      ui: {
        dressupOpen: dressPanel.style.display !== 'none',
        presetsOpen: presetPanel.style.display !== 'none',
      },
    });
  }

  // Any interaction inside the wardrobe UI can change what a pet is wearing.
  // The outfit system re-renders synchronously, so read the result on the next
  // tick and mirror it to the other windows.
  [dressPanel, presetPanel, document.getElementById('dock-bar')].forEach(el => {
    el.addEventListener('click', () => {
      setTimeout(() => { pushOutfit(); requestRedraw(); placeDock(); }, 0);
    });
  });

  function applyOutfit(outfit) {
    if (!outfit) return;
    applyingRemote = true;
    try {
      if (Array.isArray(outfit.selectedClothes)) window.selectedClothes = outfit.selectedClothes;
      if (Array.isArray(outfit.clothingColors)) window.clothingColors = outfit.clothingColors;
      if (typeof window.refreshDressUpUI === 'function') window.refreshDressUpUI();
    } finally {
      applyingRemote = false;
    }
  }

  // ---- State from main ----------------------------------------------------
  api.onOrigin((o) => {
    origin = { x: o.originX, y: o.originY, w: o.width, h: o.height };
    layout();
  });

  api.onState((s) => {
    const outfitChanged = s.outfit && JSON.stringify(s.outfit) !== JSON.stringify(currentOutfit());
    shared = s;

    applyingRemote = true;
    try {
      if (typeof window.setActivePet === 'function') window.setActivePet(s.activePet);
      if (s.ui) {
        dressPanel.style.display = s.ui.dressupOpen ? 'block' : 'none';
        presetPanel.style.display = s.ui.presetsOpen ? 'block' : 'none';
      }
    } finally {
      applyingRemote = false;
    }

    if (outfitChanged) applyOutfit(s.outfit);
    layout();
    requestRedraw();
  });

  api.onCommand((cmd) => {
    if (!cmd) return;
    if (cmd.name === 'open-dressup' || cmd.name === 'open-presets') {
      selectPet(cmd.index);
      const wantDress = cmd.name === 'open-dressup';
      dressPanel.style.display = wantDress ? 'block' : 'none';
      presetPanel.style.display = wantDress ? 'none' : 'block';
      if (wantDress && typeof window.refreshDressUpUI === 'function') window.refreshDressUpUI();
      if (!wantDress && typeof window.renderPresetPanel === 'function') window.renderPresetPanel();
      placeDock();
      pushOutfit();
    }
  });

  // First window to load seeds the shared outfit state from the config defaults.
  layout();
  requestRedraw();
  setTimeout(() => { if (!shared.outfit) pushOutfit(); }, 120);
})();
