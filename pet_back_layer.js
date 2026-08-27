// ===========================================================
// 🪽 pet_back_layer.js — body parts drawn BEHIND (and in front of) the pet
// ===========================================================
// The pet's base art is one flat sprite. Anything that is part of the BODY but
// sits behind it — wings, a tail, long hair, a ponytail — can't live in that
// sprite: it would be welded to the torso, and it would be torn apart the
// moment the base art is cut into limbs.
//
// So those parts live in their own images. This file does two jobs with them:
//
//   1. IT DECIDES WHICH FILE IS WHICH PART. Every part has a cascade of names —
//      this pet's art for this state, this pet's default art, then character
//      1's equivalents, tinted. pet_rig.js asks through window.PetParts so that
//      the ragdoll and the flat draw below can never disagree about which PNG
//      is the tail.
//
//   2. IT DRAWS THEM FLAT when the ragdoll is not running — in the modes that
//      don't simulate, and anywhere the rig is switched off or still loading.
//      Same rectangle as the body, immediately before it, so the parts inherit
//      the pet's position, size, aspect and tint with no new maths.
//
//   ART (all optional — a missing file simply draws nothing). The part names
//   come from pet_rig_config.js; out of the box:
//     images/wings.png       images/tail.png
//     images/ponytail.png    images/hair_back.png
//     images/hair_front.png  (over the body and its clothes)
//
//   Per-state variants use the state as a suffix, and are used when a mode asks
//   for that state, falling back to the plain name:
//     images/tail_fly0.png  images/tail_fly1.png   the two flap frames
//     images/tail_fall.png  images/tail_sleep.png  images/tail_bath1.png ...
//
//   Character 2 uses the same names with "_2" on the end (tail_2.png,
//   tail_fly0_2.png, ...). If his art is missing we fall back to character 1's
//   and tint it, exactly like the body already does.
//
//   images/base_back.png and images/base_front.png still work as a whole-layer
//   fallback: one image for everything behind (or in front of) the body, used
//   when no individual part art is present. It cannot move part-by-part, so
//   prefer the separate files, but nothing already drawn stops working.
//
// Nothing here is configured. A part exists if its PNG loads, the same way a
// missing hat quietly hides character 2's Hat tab. With no art at all, every
// mode draws exactly what it drew before this file existed.
(function () {
  const WHOLE_BACK = 'base_back';
  const WHOLE_FRONT = 'base_front';

  // Matches the tint the modes apply when character 2's art is missing.
  const FALLBACK_FILTER = 'hue-rotate(140deg) saturate(1.2)';

  function createImg(src) {
    const im = new Image();
    im._failed = false;
    im.onerror = () => { im._failed = true; };
    im.addEventListener('load', () => {
      // A part that arrives after the rig has already cut its artwork has to
      // ask for another cut, or it stays invisible until the next outfit change.
      window.dispatchEvent(new Event('petparts:art-changed'));
    }, { once: true });
    im.src = src; // asset_path_fix.js rewrites this to images/<name>
    return im;
  }

  // Images are created once, on first request, and kept. No fetch, no JSON —
  // the same "can't glitch mid-game" rule the outfit config is built on.
  const cache = new Map();
  function get(name) {
    if (!cache.has(name)) cache.set(name, createImg(name + '.png'));
    return cache.get(name);
  }

  function usable(im) {
    return !!(im && !im._failed && im.complete && im.naturalWidth);
  }

  function stem(name) {
    return String(name || '').replace(/\.(png|jpe?g|webp|gif|avif)$/i, '');
  }

  // Try, in order: this pet's art for this state, this pet's default art, then
  // (for pet 2) character 1's equivalents, which the caller — or we — will tint.
  function resolve(name, state, petIndex) {
    const prefix = stem(name);
    if (!prefix) return null;
    const suffix = petIndex === 1 ? '_2' : '';
    const own = [];
    const shared = [];

    if (state) own.push(`${prefix}_${state}${suffix}`);
    own.push(`${prefix}${suffix}`);
    if (suffix) {
      if (state) shared.push(`${prefix}_${state}`);
      shared.push(prefix);
    }

    for (const n of own) {
      const im = get(n);
      if (usable(im)) return { img: im, fellBack: false };
    }
    for (const n of shared) {
      const im = get(n);
      if (usable(im)) return { img: im, fellBack: true };
    }
    return null;
  }

  // The parts pet_rig_config.js declares, in draw order. Falls back to nothing
  // if the config has not loaded, which is what makes this file safe to include
  // in an app that has no rig at all.
  function declared(front) {
    const cfg = window.PET_RIG || {};
    const list = (front ? cfg.frontParts : cfg.backParts) || [];
    return list.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  }

  function drawImage(ctx, found, x, y, w, h) {
    // If we dropped back to character 1's art, tint it so it matches his body.
    // When the caller is already tinting (because the BODY fell back too) its
    // filter is on the context and does the job — don't apply it twice.
    const callerIsTinting = !!ctx.filter && ctx.filter !== 'none';
    if (found.fellBack && !callerIsTinting) {
      ctx.save();
      ctx.filter = FALLBACK_FILTER;
      ctx.drawImage(found.img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(found.img, x, y, w, h);
    }
  }

  // Every declared part that has art, flat, in z order. Returns false if there
  // was none, so the caller can try the whole-layer fallback instead.
  function drawParts(ctx, front, state, x, y, w, h, petIndex) {
    let drew = false;
    for (const def of declared(front)) {
      if (!def.img) continue;               // legacy mask parts live in the base art
      const found = resolve(def.img, state, petIndex);
      if (!found) continue;
      drawImage(ctx, found, x, y, w, h);
      drew = true;
    }
    return drew;
  }

  // Where the pet's own back parts sit among the back-layer clothes. Default 0
  // puts them behind every garment — a cape hangs over the wings. Raise it above
  // a category's z to bring the wings out in front of that garment instead.
  function backLayerZ() {
    const z = window.OUTFIT_CONFIG && window.OUTFIT_CONFIG.backLayerZ;
    return Number.isFinite(Number(z)) ? Number(z) : 0;
  }

  function backClothes(ctx, state, x, y, w, h, i, range) {
    if (typeof window.drawOutfitOverlay !== 'function') return false;
    return window.drawOutfitOverlay(ctx, state, x, y, w, h, i,
      Object.assign({ layer: 'back' }, range));
  }

  // ---- Public API -----------------------------------------------------------
  // Signature deliberately mirrors window.drawOutfitOverlay so every mode's call
  // site is a single line, inserted just before it draws the body.
  //
  // Draw order here: back clothes under the parts → the parts themselves → back
  // clothes over them. The body and its front clothes follow, drawn by the mode.
  window.drawPetBackLayer = function (ctx, state, x, y, w, h, petIndex) {
    const i = typeof petIndex === 'number' ? petIndex : 0;
    const z = backLayerZ();
    let drew = false;

    if (backClothes(ctx, state, x, y, w, h, i, { zMax: z })) drew = true;

    // A coat that swallows the wings, or a bodysuit over a tail, hides them.
    const hidden = typeof window.outfitHidesBack === 'function' && window.outfitHidesBack(i);
    if (!hidden) {
      if (drawParts(ctx, false, state, x, y, w, h, i)) drew = true;
      else {
        const whole = resolve(WHOLE_BACK, state, i);
        if (whole) { drawImage(ctx, whole, x, y, w, h); drew = true; }
      }
    }

    if (backClothes(ctx, state, x, y, w, h, i, { zMin: z })) drew = true;

    return drew;
  };

  // Parts that belong over the body AND over its clothes. Call after the mode's
  // drawOutfitOverlay. Purely optional — with no front art it does nothing.
  window.drawPetFrontLayer = function (ctx, state, x, y, w, h, petIndex) {
    const i = typeof petIndex === 'number' ? petIndex : 0;
    if (drawParts(ctx, true, state, x, y, w, h, i)) return true;
    const whole = resolve(WHOLE_FRONT, state, i);
    if (!whole) return false;
    drawImage(ctx, whole, x, y, w, h);
    return true;
  };

  // What pet_rig.js asks, so the ragdoll and the flat draw agree on the art.
  window.PetParts = { resolve, usable, has: (n, s, i) => !!resolve(n, s, i) };
})();
