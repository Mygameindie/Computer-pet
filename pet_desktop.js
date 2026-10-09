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

  // The ragdoll's limbs swing outside the pet's box, so the canvas is bigger
  // than the box by PAD on the left, right and top, and by PAD_BOTTOM below it
  // (a pet picked up by the hand dangles beneath its own box; the floor is what
  // stops it when it's on the ground). The canvas is shifted back by the same
  // amount, so the box itself doesn't move.
  const PAD = 150;
  const PAD_BOTTOM = 170;
  const SRC_H = (window.RAGDOLL_CONFIG && window.RAGDOLL_CONFIG.SRC_H) || 1134;
  const SRC_W = (window.RAGDOLL_CONFIG && window.RAGDOLL_CONFIG.SRC_W) || 851;

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
    gravity: true,
    outfit: null,
    outfitRev: 0,
    ragdoll: true,
    ui: { dressupOpen: false, presetsOpen: false },
  };
  let applyingRemote = false;   // guards against echoing state back to main
  let seenOutfitRev = -1;       // last outfit revision this window has applied
  let seenLanding = [0, 0];     // last landing timestamp per pet, for the squash

  // ---- DOM ---------------------------------------------------------------
  const dock = document.getElementById('wardrobe-dock');
  const dressBtn = document.getElementById('dressup-btn');
  const presetBtn = document.getElementById('preset-btn');
  const dressPanel = document.getElementById('dressup-panel');
  const presetPanel = document.getElementById('preset-panel');
  const dockWho = document.getElementById('dock-who');

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
      cw: 0, ch: 0,                       // canvas size in CSS px (box + PAD)
      body: window.PetRagdoll ? new window.PetRagdoll.Ragdoll() : null,
      placed: false,                      // has the skeleton been put at the pet's position yet?
      artSig: null,                       // what the sliced art was built from
      lastBox: null,
    });
  }

  // ---- Art loading --------------------------------------------------------
  let artRev = 0;                  // bumped whenever any picture finishes loading
  function loadBase(pet) {
    const im = new Image();
    im.onload = () => { sizePet(pet); artRev++; requestRedraw(); };
    im.onerror = () => {
      // No art for character 2 — reuse character 1's and tint it so the two
      // pets are still visually distinct.
      if (pet.index === 1 && !pet.usingFallbackArt) {
        pet.usingFallbackArt = true;
        pet.img = null;
        const alt = new Image();
        alt.onload = () => { pet.img = alt; sizePet(pet); artRev++; requestRedraw(); };
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
    pet.cw = pet.w + PAD * 2;
    pet.ch = pet.h + PAD + PAD_BOTTOM;
    pet.canvas.width = Math.round(pet.cw * dpr);
    pet.canvas.height = Math.round(pet.ch * dpr);
    pet.canvas.style.width = pet.cw + 'px';
    pet.canvas.style.height = pet.ch + 'px';
    pet.canvas.style.left = -PAD + 'px';
    pet.canvas.style.top = -PAD + 'px';
    pet.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pet.body) { pet.body.layout(pet.h / SRC_H); pet.placed = false; pet.artSig = null; }

    // The main process needs the real drawn size: it is what decides where the
    // floor is and how far right the pet may travel.
    if (api && typeof api.reportPetSize === 'function') api.reportPetSize(pet.index, pet.w, pet.h);
  }

  pets.forEach(pet => { sizePet(pet); loadBase(pet); });

  // ---- Drawing ------------------------------------------------------------
  let redrawQueued = false;
  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => { redrawQueued = false; drawAll(); });
  }

  // The static sprite: base art plus clothes, drawn into any 2D context at
  // (x, y) with size w × h.
  function paintSprite(pet, ctx, x, y, w, h) {
    ctx.save();
    ctx.filter = pet.usingFallbackArt ? FALLBACK_FILTER : 'none';
    if (pet.img && pet.img.complete && pet.img.naturalWidth) {
      ctx.drawImage(pet.img, x, y, w, h);
    }
    ctx.restore();

    // Clothes on top, layered by z and tinted, straight from the outfit system.
    if (typeof window.drawOutfitOverlay === 'function') {
      window.drawOutfitOverlay(ctx, 'stand', x, y, w, h, pet.index);
    }
  }

  function drawAll() {
    pets.forEach(pet => {
      const { ctx } = pet;
      const s = shared.pets[pet.index];
      if (!s || !s.visible) { ctx.clearRect(0, 0, pet.cw, pet.ch); return; }

      if (ragdollOn(pet)) { wakeRagdoll(); return; }

      ctx.clearRect(0, 0, pet.cw, pet.ch);
      paintSprite(pet, ctx, PAD, PAD, pet.w, pet.h);
    });
  }

  // ---- Ragdoll ------------------------------------------------------------
  // The skeleton hangs off the pet's box, which main.js still owns: gravity,
  // throws and the floor are decided there, and the ragdoll only decides how
  // the body behaves while that happens. It simulates only while something is
  // moving, so a pet standing still costs nothing, as before.
  function ragdollOn(pet) {
    return shared.ragdoll !== false && !!pet.body && pet.img && pet.img.complete && pet.img.naturalWidth > 0;
  }

  function outfitSig(pet) {
    const sel = (window.selectedClothes || [])[pet.index];
    const col = (window.clothingColors || [])[pet.index];
    return artRev + '|' + pet.usingFallbackArt + '|' + JSON.stringify(sel) + JSON.stringify(col);
  }

  // Slice the finished sprite (body + clothes) into the ragdoll's parts. Only
  // redone when the art or the outfit changes.
  function buildBody(pet) {
    const sig = outfitSig(pet);
    if (sig === pet.artSig) return;
    pet.artSig = sig;
    pet.needsDraw = true;
    const dpr = window.devicePixelRatio || 1;
    const k = pet.h / SRC_H;
    const comp = document.createElement('canvas');
    comp.width = Math.round(SRC_W * k * dpr);
    comp.height = Math.round(SRC_H * k * dpr);
    const cctx = comp.getContext('2d');
    paintSprite(pet, cctx, 0, 0, comp.width, comp.height);
    pet.body.buildArt(comp);
  }

  // Feed the scene's state to one pet's skeleton.
  function syncBody(pet, now) {
    const s = shared.pets[pet.index];
    const body = pet.body;
    const floorY = (typeof s.floorY === 'number') ? s.floorY : origin.y + origin.h;
    const held = (drag.active && drag.index === pet.index) || !!s.dragging;

    // A big jump that isn't a drag is a teleport (reset, un-hide): don't make
    // the body fly across the screen to catch up.
    const lb = pet.lastBox;
    const jumped = lb && !held && Math.hypot(s.x - lb.x, s.y - lb.y) > 250;
    if (!pet.placed || jumped) {
      body.box.x = s.x; body.box.y = s.y;
      body.boxVel.x = 0; body.boxVel.y = 0;
      body.snapToPose();
      pet.placed = true;
    }
    pet.lastBox = { x: s.x, y: s.y };

    body.setFloor(floorY);
    body.setBox(s.x, s.y, now);
    const airborne = shared.gravity && !held && (s.y + pet.h) < floorY - 1;
    body.setMode(held, airborne);
  }

  function drawBody(pet) {
    const { ctx } = pet;
    const s = shared.pets[pet.index];
    ctx.clearRect(0, 0, pet.cw, pet.ch);
    pet.body.draw(ctx, s.x - PAD, s.y - PAD, window.devicePixelRatio || 1);
  }

  let ragdollRaf = 0;
  let ragdollLast = 0;
  function wakeRagdoll() {
    if (ragdollRaf) return;
    ragdollLast = performance.now();
    ragdollRaf = requestAnimationFrame(ragdollFrame);
  }

  function ragdollFrame(now) {
    ragdollRaf = 0;
    const dt = Math.min((now - ragdollLast) / 1000, 0.1);
    ragdollLast = now;
    let busy = false;

    pets.forEach(pet => {
      const s = shared.pets[pet.index];
      if (!s || !s.visible || !ragdollOn(pet)) return;
      buildBody(pet);
      if (!pet.body.parts) return;
      syncBody(pet, now);
      const wasSettled = pet.body.settled;
      const active = pet.body.tick(dt);
      // Draw while moving, and once more on the frame it comes to rest.
      if (active || !wasSettled || pet.needsDraw !== false) { drawBody(pet); pet.needsDraw = false; }
      if (active) { busy = true; pet.needsDraw = true; }
    });

    if (busy) ragdollRaf = requestAnimationFrame(ragdollFrame);
  }

  // Re-draw whenever a clothing image finishes loading.
  window.addEventListener('outfit:art-changed', () => { artRev++; requestRedraw(); });

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

  // The dock is pinned to the top of the screen by CSS, so there is no geometry
  // to compute here — only the question of WHICH overlay should show it. Every
  // window runs this same scene, so without that check a two-monitor setup
  // would sprout a wardrobe bar on each screen. The one that owns the selected
  // pet gets it.
  function placeDock() {
    const active = pets[shared.activePet] || pets[0];
    const s = shared.pets[active.index];
    if (!s || !s.visible) { dock.style.display = 'none'; return; }

    const cx = s.x + active.w / 2 - origin.x;
    const cy = s.y + active.h / 2 - origin.y;
    const onThisDisplay = cx >= 0 && cx < origin.w && cy >= 0 && cy < origin.h;
    dock.style.display = onThisDisplay ? 'flex' : 'none';

    // It is no longer next to the pet it dresses, so name the pet.
    if (dockWho) dockWho.textContent = `Pet ${active.index + 1}`;
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

  // cx/cy are relative to the canvas's on-screen rectangle. That rectangle is
  // not always the sprite's natural size — the landing squash animates a
  // transform on the canvas — so map through the measured rect instead of
  // assuming 1:1, or the pet becomes ungrabbable for the length of the bounce.
  function opaqueAt(pet, cx, cy, rect) {
    const rw = (rect && rect.width) || pet.cw;
    const rh = (rect && rect.height) || pet.ch;
    cx = cx * (pet.cw / rw);
    cy = cy * (pet.ch / rh);
    if (cx < 0 || cy < 0 || cx >= pet.cw || cy >= pet.ch) return false;
    const dpr = window.devicePixelRatio || 1;
    try {
      const d = pet.ctx.getImageData(Math.floor(cx * dpr), Math.floor(cy * dpr), 1, 1).data;
      return d[3] > ALPHA_THRESHOLD;
    } catch (_) {
      // Canvas unexpectedly tainted — fall back to an inset bounding box so the
      // pet stays draggable rather than becoming impossible to grab.
      const m = 0.12;
      return cx > PAD + pet.w * m && cx < PAD + pet.w * (1 - m) && cy > PAD + pet.h * m && cy < PAD + pet.h * (1 - m);
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
      if (opaqueAt(pet, clientX - r.left, clientY - r.top, r)) return pet;
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
  const drag = { active: false, index: -1, dx: 0, dy: 0, pointerId: null, trail: [] };

  const THROW_WINDOW = 120;   // ms of pointer history a flick is measured over

  function globalFromClient(clientX, clientY) {
    return { x: clientX + origin.x, y: clientY + origin.y };
  }

  // Speed of the cursor over the last few frames, in px/second. That is the
  // velocity the pet keeps when you let go, so a flick actually throws it.
  function throwVelocity() {
    const trail = drag.trail;
    const last = trail[trail.length - 1];
    if (!last) return { vx: 0, vy: 0 };
    const first = trail.find(p => last.t - p.t <= THROW_WINDOW) || trail[0];
    const dt = (last.t - first.t) / 1000;
    if (dt < 0.008) return { vx: 0, vy: 0 };   // too short to be meaningful
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;                    // right-click opens the menu
    // The wardrobe sits inside the pet's own container and can overlap the
    // other pet's sprite. Clicks there belong to the panel, never to a drag.
    if (overDock(e.clientX, e.clientY)) return;
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
    drag.trail = [{ t: e.timeStamp, x: s.x, y: s.y }];

    pet.el.classList.add('dragging');
    // The skeleton picks up whichever joint is nearest the cursor, so grabbing
    // a hand hangs the pet by its hand.
    if (pet.body && ragdollOn(pet)) { pet.body.grab(g.x, g.y); wakeRagdoll(); }
    api.grabPet(pet.index);        // physics lets go while the cursor holds it
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
    drag.trail.push({ t: e.timeStamp, x, y });
    while (drag.trail.length > 2 && e.timeStamp - drag.trail[0].t > THROW_WINDOW) drag.trail.shift();
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
    // Hand the flick over to gravity: the pet keeps the momentum of the throw
    // and falls from wherever it was released.
    const { vx, vy } = throwVelocity();
    if (pet && pet.body) { pet.body.release(); wakeRagdoll(); }
    api.dropPet(drag.index, vx, vy);
    drag.active = false;
    drag.index = -1;
    drag.pointerId = null;
    drag.trail = [];
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

  // State arrives on every physics frame while a pet is falling, so this path
  // has to be cheap AND must not touch the wardrobe DOM unless something the
  // wardrobe cares about actually changed — rebuilding the Dress Up panel 60
  // times a second made it flicker and swallowed clicks.
  api.onState((s) => {
    const prev = shared;
    shared = s;

    applyingRemote = true;
    try {
      if (s.activePet !== prev.activePet) {
        if (typeof window.setActivePet === 'function') window.setActivePet(s.activePet);
      }
      if (s.ui) {
        setPanel(dressPanel, !!s.ui.dressupOpen, window.refreshDressUpUI);
        setPanel(presetPanel, !!s.ui.presetsOpen, window.renderPresetPanel);
      }
    } finally {
      applyingRemote = false;
    }

    // The outfit only changes when someone touches the wardrobe, and main bumps
    // a revision counter when it does — so the expensive compare is rare.
    if (s.outfit && s.outfitRev !== seenOutfitRev) {
      seenOutfitRev = s.outfitRev;
      if (JSON.stringify(s.outfit) !== JSON.stringify(currentOutfit())) applyOutfit(s.outfit);
    }

    // Landing squash, driven by the impact main reported.
    s.pets.forEach((ps, i) => {
      if (!ps || !pets[i] || !ps.landedAt || ps.landedAt === seenLanding[i]) return;
      seenLanding[i] = ps.landedAt;
      if (!ps.visible) return;
      if (ragdollOn(pets[i])) { pets[i].body.impact(ps.impact || 0); wakeRagdoll(); }
      else squash(pets[i], ps.impact || 0);
    });

    layout();
    requestRedraw();
  });

  // Show or hide a wardrobe panel, re-rendering its contents only on the
  // transition into "open".
  function setPanel(panel, open, render) {
    const isOpen = panel.style.display !== 'none';
    if (isOpen === open) return;
    panel.style.display = open ? 'block' : 'none';
    if (open && typeof render === 'function') render();
  }

  function squash(pet, impact) {
    const c = pet.canvas;
    c.style.setProperty('--squash', (0.08 + 0.16 * Math.max(0, Math.min(1, impact))).toFixed(3));
    c.classList.remove('landing');
    void c.offsetWidth;          // restart the animation from the top
    c.classList.add('landing');
  }

  // Drop the class as soon as the bounce is over, so the canvas goes back to
  // its untransformed size and nothing has to compensate for it.
  pets.forEach(pet => {
    pet.canvas.addEventListener('animationend', () => pet.canvas.classList.remove('landing'));
  });

  api.onCommand((cmd) => {
    if (!cmd) return;
    if (cmd.name === 'open-dressup' || cmd.name === 'open-presets') {
      selectPet(cmd.index);
      const wantDress = cmd.name === 'open-dressup';
      setPanel(dressPanel, wantDress, window.refreshDressUpUI);
      setPanel(presetPanel, !wantDress, window.renderPresetPanel);
      placeDock();
      pushOutfit();
    }
  });

  // First window to load seeds the shared outfit state from the config defaults.
  layout();
  requestRedraw();
  setTimeout(() => { if (!shared.outfit) pushOutfit(); }, 120);
})();
