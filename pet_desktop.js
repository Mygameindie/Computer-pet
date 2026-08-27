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

  // A ragdoll does not stay inside the box the artwork occupies — a thrown arm
  // swings well past the shoulder, and a tail swings further still. Each pet's
  // canvas is grown by this much on every side and the whole element shifted
  // back by the same amount, so the pet's logical box lands exactly where it
  // always did and only the room to flail is new. main.js is never told about
  // the padding: it works out the floor from the logical size, and a padded one
  // would sink the pet into the desktop.
  const PAD = Math.round(PET_HEIGHT * 0.45);

  // One rig per pet — separate points, separate cut-up artwork, separate
  // outfit. Absent if pet_rig.js failed to load, in which case every pet falls
  // back to the flat sprite it drew before.
  const RigApi = window.PetRig || null;

  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
    ui: { dressupOpen: false, presetsOpen: false },
  };
  let applyingRemote = false;   // guards against echoing state back to main
  let seenOutfitRev = -1;       // last outfit revision this window has applied
  let seenLanding = [0, 0];     // last landing timestamp per pet, for the landing hit
  const lastPos = [{ x: 0, y: 0 }, { x: 0, y: 0 }];   // to spot a teleport rather than a throw

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
      cw: 0,                       // canvas size, i.e. w/h plus the padding
      ch: 0,
      scale: 1,                    // source artwork pixels -> CSS pixels
      rig: RigApi ? RigApi.create({ petIndex: i }) : null,
      recoverUntil: 0,             // pose spring ramping back up after a throw
    });
  }

  // ---- Art loading --------------------------------------------------------
  function loadBase(pet) {
    const adopt = (im) => {
      sizePet(pet);
      if (pet.rig) { pet.rig.setBase(im); resetRig(pet); }
      requestRedraw();
    };
    const im = new Image();
    im.onload = () => adopt(im);
    im.onerror = () => {
      // No art for character 2 — reuse character 1's and tint it so the two
      // pets are still visually distinct.
      if (pet.index === 1 && !pet.usingFallbackArt) {
        pet.usingFallbackArt = true;
        pet.img = null;
        const alt = new Image();
        alt.onload = () => { pet.img = alt; adopt(alt); };
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

    // The drawn canvas is the pet's box plus room for a flailing limb.
    pet.cw = pet.w + PAD * 2;
    pet.ch = pet.h + PAD * 2;
    pet.scale = pet.rig ? pet.h / pet.rig.srcH : 1;

    // Back the canvas at device resolution so the sprite stays crisp on HiDPI
    // and Retina screens, but keep the CSS box in layout pixels.
    const dpr = window.devicePixelRatio || 1;
    pet.canvas.width = Math.round(pet.cw * dpr);
    pet.canvas.height = Math.round(pet.ch * dpr);
    pet.canvas.style.width = pet.cw + 'px';
    pet.canvas.style.height = pet.ch + 'px';
    pet.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The main process needs the real drawn size: it is what decides where the
    // floor is and how far right the pet may travel.
    if (api && typeof api.reportPetSize === 'function') api.reportPetSize(pet.index, pet.w, pet.h);
  }

  pets.forEach(pet => { sizePet(pet); loadBase(pet); });

  // ---- Drawing ------------------------------------------------------------
  // There is a real animation loop here, not just a redraw on state: a settling
  // ragdoll has to keep being drawn after main has stopped sending frames. It
  // still stops dead once nothing is moving, so an idle pet costs nothing —
  // the same bargain main.js makes with its physics timer.
  let rafId = 0, lastFrame = 0;

  function requestRedraw() {
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function petState(pet) { return shared.pets[pet.index] || {}; }

  function airborne(pet) {
    const s = petState(pet);
    return typeof s.floor === 'number' && s.y < s.floor - 0.5;
  }

  // What the rig needs to know about the world this frame.
  function rigView(pet) {
    const s = petState(pet);
    const floor = (typeof s.floor === 'number') ? s.floor + pet.rig.footY * pet.scale : null;
    return {
      petX: s.x || 0, petY: s.y || 0,
      scale: pet.scale, pad: PAD, floorY: floor,
      poseK: pet.rig.pose.idle, pin: null,
      airborne: airborne(pet),     // wings flap in the air and settle on the ground
    };
  }

  // The whole mode machine. One number: how hard the pose is held. Standing
  // holds it, being carried barely holds it at all, and after a landing or a
  // release it eases back up instead of snapping.
  function poseStrength(pet, now) {
    const R = pet.rig;
    if (reduceMotion) return R.pose.idle;
    if (drag.active && drag.index === pet.index) {
      return drag.joint ? R.pose.heldLimb : R.pose.heldBody;
    }
    if (airborne(pet)) return R.pose.airborne;
    if (now < pet.recoverUntil) {
      const t = 1 - (pet.recoverUntil - now) / R.recoverMs;
      return R.pose.airborne + (R.pose.idle - R.pose.airborne) * t;
    }
    return R.pose.idle;
  }

  function frame(t) {
    rafId = 0;
    const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.05) : 1 / 60;
    lastFrame = t;

    let alive = false;
    for (const pet of pets) {
      const R = pet.rig;
      if (!R || !R.ready) { drawFlat(pet); continue; }
      const S = rigView(pet);
      S.poseK = poseStrength(pet, t);
      if (drag.active && drag.index === pet.index && drag.joint) {
        S.pin = { joint: drag.joint, x: drag.gx, y: drag.gy };
      }
      R.step(dt, S);
      drawRig(pet, S);
      if (R.moved > R.sleepEps * pet.scale || R.busy
          || (drag.active && drag.index === pet.index)
          || airborne(pet) || t < pet.recoverUntil) alive = true;
    }
    if (alive) requestRedraw(); else lastFrame = 0;
  }

  function drawRig(pet, S) {
    const { ctx } = pet;
    ctx.clearRect(0, 0, pet.cw, pet.ch);
    if (!petState(pet).visible) return;
    if (pet.rig.debug) {
      pet.rig.setDebugInfo('pet ' + pet.index + '  pose ' + S.poseK.toFixed(2) +
        (drag.joint && drag.index === pet.index ? '  grip:' + drag.joint : '') +
        (airborne(pet) ? '  air' : ''));
    }
    // Character 2 falling back to character 1's art is tinted here, exactly as
    // the flat draw used to do it — the rig only decides where the pieces go.
    ctx.save();
    ctx.filter = pet.usingFallbackArt ? FALLBACK_FILTER : 'none';
    pet.rig.draw(ctx, S);
    ctx.restore();
  }

  // Only reached before the rig has cut the artwork up, if the rig is switched
  // off in pet_rig_config.js, or if pet_rig.js failed to load at all. Draws the
  // pet the old way so it is never invisible — back parts included, so a pet
  // with a tail still has one while the rig is warming up.
  function drawFlat(pet) {
    const { ctx } = pet;
    const px = pet.cw ? PAD : 0;
    ctx.clearRect(0, 0, pet.cw || pet.w, pet.ch || pet.h);
    if (!petState(pet).visible) return;

    ctx.save();
    ctx.filter = pet.usingFallbackArt ? FALLBACK_FILTER : 'none';
    if (typeof window.drawPetBackLayer === 'function') {
      window.drawPetBackLayer(ctx, 'stand', px, px, pet.w, pet.h, pet.index);
    }
    if (pet.img && pet.img.complete && pet.img.naturalWidth) {
      ctx.drawImage(pet.img, px, px, pet.w, pet.h);
    }
    ctx.restore();

    // Clothes on top, layered by z and tinted, straight from the outfit system.
    if (typeof window.drawOutfitOverlay === 'function') {
      window.drawOutfitOverlay(ctx, 'stand', px, px, pet.w, pet.h, pet.index);
    }
    if (typeof window.drawPetFrontLayer === 'function') {
      window.drawPetFrontLayer(ctx, 'stand', px, px, pet.w, pet.h, pet.index);
    }
  }

  // Put every joint back where it stands and forget the momentum it had. Used
  // when a pet is first placed or teleported, so it doesn't whip across the
  // screen catching up with itself.
  function resetRig(pet) {
    if (!pet.rig || !pet.rig.ready) return;
    pet.rig.placeRest(rigView(pet));
    pet.rig.snap();
  }

  // Re-cut the limbs. The clothes are flattened onto the base before cutting,
  // so this is what has to happen when the wardrobe changes — never per frame.
  function restyle() {
    pets.forEach(pet => { if (pet.rig) pet.rig.rebuild(); });
    requestRedraw();
  }

  // Re-draw whenever a clothing image finishes loading.
  window.addEventListener('outfit:art-changed', restyle);

  // A wing or tail PNG that lands after the first cut: each rig re-cuts itself,
  // so this only has to get a frame drawn once they have.
  window.addEventListener('petparts:art-changed', () => requestRedraw());

  // Ctrl+Shift+B draws the skeleton, the joints, each bone's derived cut and
  // every back-part chain over both pets — the only sane way to re-tune the
  // numbers in pet_rig_config.js, or to drag them onto new artwork.
  window.addEventListener('keydown', (e) => {
    if (!RigApi || !e.ctrlKey || !e.shiftKey || (e.key !== 'B' && e.key !== 'b')) return;
    const on = !pets[0].rig.debug;
    pets.forEach(pet => pet.rig && pet.rig.setDebug(on));
    requestRedraw();
  });

  // ---- Layout -------------------------------------------------------------
  function layout() {
    pets.forEach(pet => {
      const s = shared.pets[pet.index];
      if (!s || !s.visible) { pet.el.style.display = 'none'; return; }
      pet.el.style.display = 'flex';
      pet.el.style.left = (s.x - origin.x - PAD) + 'px';
      pet.el.style.top = (s.y - origin.y - PAD) + 'px';
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
    const cy = s.y + active.h / 2 - origin.y;   // s.x/s.y are the unpadded box
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
    const rw = (rect && rect.width) || pet.w;
    const rh = (rect && rect.height) || pet.h;
    // The canvas is the padded one, so map into IT, not into the logical box:
    // a thrown arm sticking out into the padding is still the pet, and has to
    // be grabbable where it actually is.
    const CW = pet.cw || pet.w, CH = pet.ch || pet.h;
    cx = cx * (CW / rw);
    cy = cy * (CH / rh);
    if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) return false;
    const dpr = window.devicePixelRatio || 1;
    try {
      const d = pet.ctx.getImageData(Math.floor(cx * dpr), Math.floor(cy * dpr), 1, 1).data;
      return d[3] > ALPHA_THRESHOLD;
    } catch (_) {
      // Canvas unexpectedly tainted — fall back to an inset bounding box so the
      // pet stays draggable rather than becoming impossible to grab.
      const p = pet.cw ? PAD : 0, m = 0.12;
      return cx > p + pet.w * m && cx < p + pet.w * (1 - m) &&
             cy > p + pet.h * m && cy < p + pet.h * (1 - m);
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
  // 'joint' is what turns a drag of the whole pet into a drag of one LIMB: when
  // it names a hand or a foot, that single point is pinned to the cursor and the
  // body leans into the pull instead of the pet moving. The pet's position is
  // then left alone entirely — nothing is sent to main, because the body has not
  // gone anywhere.
  const drag = { active: false, index: -1, dx: 0, dy: 0, pointerId: null, trail: [],
                 joint: null, gx: 0, gy: 0 };

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
    drag.gx = g.x; drag.gy = g.y;

    // Grabbed a hand or a foot? Then this is a limb drag, not a body drag.
    const bone = (pet.rig && pet.rig.ready) ? pet.rig.boneAt(g.x, g.y, pet.scale) : null;
    drag.joint = pet.rig ? pet.rig.handleFor(bone) : null;

    pet.el.classList.add('dragging');
    // Physics lets go while the cursor holds the BODY. A limb drag leaves the
    // body exactly where it is, so gravity keeps running underneath it.
    if (!drag.joint) api.grabPet(pet.index);
    // Pointer capture keeps move/up events coming to this window even after the
    // cursor leaves it — that's what allows dragging onto another display.
    try { pet.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag.active || (drag.pointerId !== null && e.pointerId !== drag.pointerId)) return;
    const g = globalFromClient(e.clientX, e.clientY);
    drag.gx = g.x; drag.gy = g.y;

    // Pulling a limb: the body stays put and the rig leans it over. Nothing is
    // sent to main and nothing is laid out — only the pinned point has moved.
    if (drag.joint) { requestRedraw(); e.preventDefault(); return; }

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
    requestRedraw();
    e.preventDefault();
  });

  function endDrag(e) {
    if (!drag.active) return;
    const pet = pets[drag.index];
    if (pet) {
      pet.el.classList.remove('dragging');
      try { if (e && drag.pointerId !== null) pet.canvas.releasePointerCapture(drag.pointerId); } catch (_) {}
    }
    if (drag.joint) {
      // Let go of a limb and it swings back into the standing pose rather than
      // snapping to it. Nothing to tell main — the body never moved.
      if (pet) pet.recoverUntil = performance.now() + (pet.rig ? pet.rig.recoverMs : 0);
      requestRedraw();
    } else {
      // Hand the flick over to gravity: the pet keeps the momentum of the throw
      // and falls from wherever it was released.
      const { vx, vy } = throwVelocity();
      api.dropPet(drag.index, vx, vy);
    }
    drag.active = false;
    drag.index = -1;
    drag.pointerId = null;
    drag.trail = [];
    drag.joint = null;
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

    // Landing, driven by the impact main reported. The ragdoll does this now —
    // it whips the body down and the pose spring pulls it back up — so there is
    // no CSS squash any more, and the limbs arriving late is the part that
    // actually reads as the impact.
    s.pets.forEach((ps, i) => {
      const pet = pets[i];
      if (!ps || !pet || !ps.landedAt || ps.landedAt === seenLanding[i]) return;
      seenLanding[i] = ps.landedAt;
      if (!ps.visible) return;
      if (pet.rig && pet.rig.ready) {
        pet.rig.kick(ps.impact || 0);
        pet.recoverUntil = performance.now() + pet.rig.recoverMs;
      } else {
        squash(pet, ps.impact || 0);
      }
    });

    // A jump this large is a teleport — first placement, or a monitor coming and
    // going — not a throw. Snap the rig to it, or the limbs spend the next
    // second whipping across the screen catching up with a move that never
    // physically happened.
    s.pets.forEach((ps, i) => {
      const pet = pets[i];
      if (!ps || !pet) return;
      if (Math.abs(ps.x - lastPos[i].x) > pet.w * 3 || Math.abs(ps.y - lastPos[i].y) > pet.h * 3) {
        resetRig(pet);
      }
      lastPos[i].x = ps.x; lastPos[i].y = ps.y;
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

  // The old CSS keyframe. Only reached when the rig is off or not yet ready, so
  // a pet still reacts to hitting the floor in the fallback path.
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
