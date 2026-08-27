// ===========================================================
// 🦴 pet_rig.js — bones, grips, back parts and the ragdoll
// ===========================================================
//
//  WHAT THIS IS
//  The pet's artwork is one flat PNG. This file cuts it into limbs along the
//  skeleton in pet_rig_config.js, hangs those limbs off shared joint points,
//  and simulates them so the pet flops when you throw it and stands up again
//  when it lands. Wings, tails and hair are separate images hung off the same
//  bones, so they move with the body instead of being welded into it.
//
//  THE FOUR IDEAS
//
//  1. A JOINT IS A SINGLE POINT. The elbow is not "two bones that agree to
//     stay together" — it is one simulated point that the upper arm and the
//     forearm both use as their end. There is no code that could ever let them
//     drift apart, because there is nothing to drift: that is the grip.
//
//  2. VERLET, NOT VELOCITY. Each point remembers where it was last frame
//     instead of storing a velocity. Moving a point IS giving it momentum,
//     which is why simply pinning a hand to the cursor makes the whole arm
//     swing correctly with no extra work.
//
//  3. THE POSE SPRING DECIDES EVERYTHING. Every point is pulled back toward
//     where it stands at rest. Pull hard and the pet stands up; pull barely at
//     all and it goes limp. Dragging, throwing and landing do not have separate
//     animations — they just turn that one number up and down.
//
//  4. THE CUTS FOLLOW THE SKELETON. A pixel belongs to whichever bone it is
//     nearest to. Nothing about which pixels are an arm is written down, so
//     moving the joints onto differently-posed artwork is the whole job of
//     re-rigging — there is no second list to keep in step. See deriveCuts().
//
//  The rig is deliberately renderer-side. The host app still owns the pet's
//  position, its fall and its floor; this only decides what the body does
//  around that position.
//
//  Simulation runs in the host's own pixel coordinates. That is what makes the
//  limbs lag behind when the body is yanked sideways: the rest pose moves with
//  the body and the points have to catch up.
//
//  ONE RIG PER PET. window.PetRig.create() makes an independent one — its own
//  points, its own cut-up artwork, its own outfit. window.PetRig itself is the
//  first of them, so an app with a single pet can ignore create() entirely.
// ===========================================================

window.PetRig = (function () {
  const CFG = window.PET_RIG || {};
  const SRC = CFG.src || { w: 851, h: 1134 };
  const T = CFG.tuning || {};
  const DEG = Math.PI / 180;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ===========================================================================
  //  SHARED GEOMETRY — derived once per pose, used by every pet
  // ===========================================================================
  //  None of this depends on what a pet is wearing or which base art it uses,
  //  only on the skeleton, so two pets in the same pose share it.

  const geomCache = {};

  function geometry(poseName) {
    if (geomCache[poseName]) return geomCache[poseName];

    const poses = CFG.poses || {};
    const pose = poses[poseName] || poses[CFG.restPose] || poses[Object.keys(poses)[0]];
    if (!pose) throw new Error('pet_rig: no pose in PET_RIG.poses');

    const rest = {};
    for (const k in pose.joints) rest[k] = { x: pose.joints[k].x, y: pose.joints[k].y };

    const limits = pose.limits || {};
    const bones = (CFG.bones || []).map(def => {
      const A = rest[def.a], B = rest[def.b];
      return {
        def,
        id: def.id,
        len: Math.hypot(B.x - A.x, B.y - A.y),
        ang: Math.atan2(B.y - A.y, B.x - A.x),
        limit: limits[def.id] || null,
        z: def.z || 0,
      };
    });
    const byId = {};
    bones.forEach(b => { byId[b.id] = b; });

    // A bone's parent is whichever bone ends where this one starts. Arms, legs
    // and the head start at joints no bone ends at (shoulders, hips, neck) —
    // those hang off the torso.
    for (const b of bones) {
      const p = bones.find(o => o !== b && o.def.b === b.def.a);
      b.parent = p || (b.id === 'torso' ? null : byId.torso || null);
    }
    // Rest angle relative to the parent — what the joint limits are measured
    // from, and therefore what makes the limits pose-relative for free.
    for (const b of bones) b.rel = b.ang - (b.parent ? b.parent.ang : 0);

    const braces = (CFG.braces || [])
      .filter(([a, b]) => rest[a] && rest[b])
      .map(([a, b]) => ({ a, b, len: Math.hypot(rest[b].x - rest[a].x, rest[b].y - rest[a].y) }));

    // Shoulders and hips must stay on their own side of the spine.
    //
    // Distances alone cannot tell left from right: swap the two hips and every
    // brace measures exactly the same, so a hard landing can mirror the pelvis
    // and the solver is perfectly happy with the result. Nothing pulls it back
    // either, because unswapping means dragging the two hips through each other
    // and the brace between them forbids that. So the pet lands, its legs cross,
    // and they stay crossed forever. Sign is the missing information. The limbs
    // are deliberately left out — an arm folding across the chest is a pose.
    let ax = rest.pelvis.x - rest.chest.x, ay = rest.pelvis.y - rest.chest.y;
    const an = Math.hypot(ax, ay) || 1;
    ax /= an; ay /= an;
    const sides = ['shoulderL', 'shoulderR', 'hipL', 'hipR'].filter(n => rest[n]).map(name => {
      const d = ax * (rest[name].y - rest.chest.y) - ay * (rest[name].x - rest.chest.x);
      return { name, sign: Math.sign(d), min: Math.abs(d) * 0.35 };
    });

    // Which joint you actually take hold of when you grab a given limb. Only
    // the far ends are draggable — grabbing an upper arm and pulling would just
    // be a confusing way to move the whole pet.
    const handle = { armLL: 'handL', armRL: 'handR', legLL: 'footL', legRL: 'footR' };

    // Which joint each handle hangs off, and the two bones between them. A limb
    // has a length and a range of movement; the cursor has neither. Without
    // this the solver is handed a demand the skeleton cannot meet, and the only
    // answer it has is to stretch the bones — which looks as wrong as it is.
    const reach = {
      handL: { from: 'shoulderL', chain: ['armLU', 'armLL'] },
      handR: { from: 'shoulderR', chain: ['armRU', 'armRL'] },
      footL: { from: 'hipL', chain: ['legLU', 'legLL'] },
      footR: { from: 'hipR', chain: ['legRU', 'legRL'] },
    };

    // The ground, in source pixels: where the feet rest inside the artwork. The
    // sprite has empty space below the feet, so this is NOT the image bottom.
    const footY = Math.max(rest.footL ? rest.footL.y : 0, rest.footR ? rest.footR.y : 0);

    const parts = []
      .concat((CFG.backParts || []).map(def => ({ def, front: false })))
      .concat((CFG.frontParts || []).map(def => ({ def, front: true })));
    for (const p of parts) {
      p.id = p.def.id;
      p.z = p.def.z || 0;
      p.bone = byId[p.def.bone] || byId.torso || bones[0];
      p.anchor = p.def.anchor || { x: SRC.w / 2, y: SRC.h / 2 };
      p.segments = Math.max(0, p.def.segments | 0);
    }

    const G = {
      poseName, rest, bones, byId, braces, sides, handle, reach, footY, parts,
      reachSlack: pose.reachSlack || 1.05,
      cx: (rest.chest.x + rest.pelvis.x) / 2,
      // Everything that gets drawn, back to front.
      drawList: bones.map(b => ({ kind: 'bone', ref: b, z: b.z })
      ).concat(parts.map(p => ({ kind: 'part', ref: p, z: p.z }))
      ).sort((p, q) => p.z - q.z),
    };
    geomCache[poseName] = G;
    return G;
  }

  // ===========================================================================
  //  CUTTING THE ARTWORK UP
  // ===========================================================================

  // Row runs [y, x0, x1] belonging to a legacy mask part, as a full-canvas pixel
  // lookup. Those pixels are the part's, so no bone may claim them — without
  // this an arm swung out of place takes a lump of wing along with it.
  //
  // The runs are GROWN by cutOverlap before use, and the very same grown mask is
  // what carves the part itself. Both halves have to agree to the pixel: measure
  // a wing's fill but not the antialiased line around it and that outline stays
  // welded to the torso, so the wing swings and leaves a ghost of itself behind.
  // Sharing one mask makes disagreeing impossible.
  const maskCache = {};
  function maskFor(def) {
    if (!def.mask) return null;
    if (maskCache[def.id]) return maskCache[def.id];
    const m = new Uint8Array(SRC.w * SRC.h);
    for (let i = 0; i < def.mask.length; i += 3) {
      const y = def.mask[i];
      if (y < 0 || y >= SRC.h) continue;
      const row = y * SRC.w;
      const x1 = Math.min(SRC.w - 1, def.mask[i + 2]);
      for (let x = Math.max(0, def.mask[i + 1]); x <= x1; x++) m[row + x] = 1;
    }
    const grown = dilate(m, SRC.w, SRC.h, Math.max(0, T.cutOverlap | 0));
    // Growing can push the mask past the rect the part is actually cut out of.
    // Those pixels would then be claimed by nobody — excluded from every bone
    // and outside the part — and punch a few holes in the pet. Clip them back.
    if (def.rect) {
      const [rx, ry, rw, rh] = def.rect;
      for (let y = 0; y < SRC.h; y++) {
        const row = y * SRC.w;
        const inRow = y >= ry && y < ry + rh;
        for (let x = 0; x < SRC.w; x++) {
          if (!grown[row + x]) continue;
          if (!inRow || x < rx || x >= rx + rw) grown[row + x] = 0;
        }
      }
    }
    maskCache[def.id] = grown;
    return grown;
  }

  let maskedPixels;
  function maskedLookup() {
    if (maskedPixels !== undefined) return maskedPixels;
    let all = null;
    for (const def of (CFG.backParts || []).concat(CFG.frontParts || [])) {
      const m = maskFor(def);
      if (!m) continue;
      if (!all) all = new Uint8Array(SRC.w * SRC.h);
      for (let i = 0; i < all.length; i++) if (m[i]) all[i] = 1;
    }
    maskedPixels = all;
    return all;
  }

  // Grow a binary mask outward by r pixels, as two separable passes. This is
  // what stops a hairline gap opening along a joint when a limb turns: the two
  // sides overlap by r instead of meeting exactly.
  function dilate(m, w, h, r) {
    if (!r) return m;
    const t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let d = -r; d <= r; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w && m[row + xx]) { v = 1; break; }
        }
        t[row + x] = v;
      }
    }
    const o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let d = -r; d <= r; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < h && t[yy * w + x]) { v = 1; break; }
        }
        o[y * w + x] = v;
      }
    }
    return o;
  }

  // Turn a binary mask over [rect] into a canvas holding only those pixels of
  // 'srcCanvas'.
  function maskedCut(srcCanvas, rect, mask) {
    const [rx, ry, rw, rh] = rect;
    const c = document.createElement('canvas');
    c.width = Math.max(1, rw); c.height = Math.max(1, rh);
    const g = c.getContext('2d');
    g.drawImage(srcCanvas, rx, ry, rw, rh, 0, 0, rw, rh);

    const mc = document.createElement('canvas');
    mc.width = c.width; mc.height = c.height;
    const mg = mc.getContext('2d');
    const id = mg.createImageData(rw, rh);
    for (let i = 0; i < rw * rh; i++) if (mask[i]) id.data[i * 4 + 3] = 255;
    mg.putImageData(id, 0, 0);

    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mc, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // The polygon path, kept for a bone that overrides its cut by hand.
  function growPoly(poly, px) {
    if (!px) return poly;
    let cx = 0, cy = 0;
    for (const p of poly) { cx += p[0]; cy += p[1]; }
    cx /= poly.length; cy /= poly.length;
    return poly.map(([x, y]) => {
      const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
      return [x + dx / L * px, y + dy / L * px];
    });
  }

  function polyCut(srcCanvas, rect, clip) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, rect[2]); c.height = Math.max(1, rect[3]);
    const g = c.getContext('2d');
    g.drawImage(srcCanvas, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    growPoly(clip, T.clipGrow || 0).forEach(([x, y], i) => {
      const px = x - rect[0], py = y - rect[1];
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // ---- The automatic cut ----------------------------------------------------
  // Give every opaque pixel to the bone whose segment it is nearest to, then
  // hand each bone its own pixels. This is the rule the old hand-measured clip
  // polygons were built from, run against the actual artwork instead of being
  // frozen into a list — which is what lets the skeleton be re-posed without
  // re-measuring anything.
  function deriveCuts(skin, G) {
    const w = SRC.w, h = SRC.h;
    let px;
    try {
      px = skin.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    } catch (_) {
      return null;   // tainted canvas — caller falls back to the flat sprite
    }

    const bones = G.bones, nb = bones.length;
    const seg = bones.map(b => {
      const A = G.rest[b.def.a], B = G.rest[b.def.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      return { ax: A.x, ay: A.y, dx, dy, L: (dx * dx + dy * dy) || 1 };
    });
    const excluded = maskedLookup();

    const label = new Int16Array(w * h).fill(-1);
    // bbox per bone, accumulated in the same pass
    const bx0 = new Int32Array(nb).fill(w), by0 = new Int32Array(nb).fill(h);
    const bx1 = new Int32Array(nb).fill(-1), by1 = new Int32Array(nb).fill(-1);

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (px[(i << 2) + 3] < 8) continue;
        if (excluded && excluded[i]) continue;
        let best = 0, bd = Infinity;
        for (let k = 0; k < nb; k++) {
          const s = seg[k];
          let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.L;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = s.ax + t * s.dx - x, qy = s.ay + t * s.dy - y;
          const d = qx * qx + qy * qy;
          if (d < bd) { bd = d; best = k; }
        }
        label[i] = best;
        if (x < bx0[best]) bx0[best] = x;
        if (x > bx1[best]) bx1[best] = x;
        if (y < by0[best]) by0[best] = y;
        if (y > by1[best]) by1[best] = y;
      }
    }

    const OV = Math.max(0, T.cutOverlap | 0);
    const out = [];
    for (let k = 0; k < nb; k++) {
      if (bx1[k] < 0) { out.push(null); continue; }
      const pad = OV + 1;
      const x0 = Math.max(0, bx0[k] - pad), y0 = Math.max(0, by0[k] - pad);
      const x1 = Math.min(w - 1, bx1[k] + pad), y1 = Math.min(h - 1, by1[k] + pad);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      let m = new Uint8Array(bw * bh);
      for (let y = y0; y <= y1; y++) {
        const srow = y * w, drow = (y - y0) * bw;
        for (let x = x0; x <= x1; x++) if (label[srow + x] === k) m[drow + (x - x0)] = 1;
      }
      m = dilate(m, bw, bh, OV);
      out.push({ rect: [x0, y0, bw, bh], mask: m });
    }
    return out;
  }

  // ---- Slicing a chain part into strips -------------------------------------
  // A ponytail rotating in one piece reads as a plank. So the part is cut into
  // strips along its own length and each strip gets a simulated point, which is
  // what lets it whip and settle. The axis is measured off the artwork — from
  // the anchor to the farthest opaque pixel — so a tail that sweeps down and
  // back is sliced along the way it actually lies, with nothing to configure.
  function sliceChain(img, part) {
    const w = SRC.w, h = SRC.h;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    let px;
    try { px = g.getImageData(0, 0, w, h).data; } catch (_) { return null; }

    const ax = part.anchor.x, ay = part.anchor.y;
    let fx = ax, fy = ay, fd = 0, any = false;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (px[((row + x) << 2) + 3] < 8) continue;
        any = true;
        const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
        if (d > fd) { fd = d; fx = x; fy = y; }
      }
    }
    if (!any || fd < 4) return null;

    const L = Math.sqrt(fd);
    const ux = (fx - ax) / L, uy = (fy - ay) / L;
    const n = part.segments;

    // Segment lengths. chainTaper < 1 makes the root segment the shortest, so
    // most of the length — and most of the whip — sits nearer the tip.
    const taper = T.chainTaper == null ? 1 : T.chainTaper;
    const wts = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = Math.pow(taper, n - 1 - i); wts.push(v); sum += v; }
    const bounds = [0];
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += wts[i] / sum; bounds.push(acc); }

    // Rest position of every chain point, in source pixels.
    const restPts = bounds.map(t => ({ x: ax + ux * L * t, y: ay + uy * L * t }));

    // Label each opaque pixel with the strip it falls in.
    const label = new Int16Array(w * h).fill(-1);
    const sx0 = new Int32Array(n).fill(w), sy0 = new Int32Array(n).fill(h);
    const sx1 = new Int32Array(n).fill(-1), sy1 = new Int32Array(n).fill(-1);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (px[(i << 2) + 3] < 8) continue;
        const s = ((x - ax) * ux + (y - ay) * uy) / L;
        let k = 0;
        while (k < n - 1 && s > bounds[k + 1]) k++;
        label[i] = k;
        if (x < sx0[k]) sx0[k] = x;
        if (x > sx1[k]) sx1[k] = x;
        if (y < sy0[k]) sy0[k] = y;
        if (y > sy1[k]) sy1[k] = y;
      }
    }

    const OV = Math.max(0, T.cutOverlap | 0);
    const strips = [];
    for (let k = 0; k < n; k++) {
      if (sx1[k] < 0) { strips.push(null); continue; }
      const pad = OV + 1;
      const x0 = Math.max(0, sx0[k] - pad), y0 = Math.max(0, sy0[k] - pad);
      const x1 = Math.min(w - 1, sx1[k] + pad), y1 = Math.min(h - 1, sy1[k] + pad);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      let m = new Uint8Array(bw * bh);
      for (let y = y0; y <= y1; y++) {
        const srow = y * w, drow = (y - y0) * bw;
        for (let x = x0; x <= x1; x++) if (label[srow + x] === k) m[drow + (x - x0)] = 1;
      }
      m = dilate(m, bw, bh, OV);
      strips.push({
        rect: [x0, y0, bw, bh],
        canvas: maskedCut(c, [x0, y0, bw, bh], m),
        // Where this strip hangs, and which way it points, at rest.
        a: restPts[k], b: restPts[k + 1],
        ang: Math.atan2(restPts[k + 1].y - restPts[k].y, restPts[k + 1].x - restPts[k].x),
        len: Math.hypot(restPts[k + 1].x - restPts[k].x, restPts[k + 1].y - restPts[k].y),
      });
    }
    return { restPts, strips, axis: { x: ux, y: uy }, length: L };
  }

  // ===========================================================================
  //  ONE PET
  // ===========================================================================

  function create(opts) {
    const o = opts || {};
    const petIndex = o.petIndex || 0;
    let G = geometry(o.pose || CFG.restPose);

    // ---- Points -------------------------------------------------------------
    // x/y are where the point is now, px/py where it was a step ago. Their
    // difference is the velocity — there is no separate velocity to keep in sync.
    let P, points;
    function makePoints() {
      P = {}; points = [];
      for (const k in G.rest) {
        const p = { name: k, x: 0, y: 0, px: 0, py: 0, rx: 0, ry: 0, w: 1, chain: null };
        P[k] = p; points.push(p);
      }
    }
    makePoints();

    let baseImg = null, skin = null, ready = false;
    let squash = 0, squashVel = 0, acc = 0, moved = 0, swayT = 0;
    let debug = false, debugInfo = '';

    // Per-instance cut artwork, keyed by bone id / part id.
    const cuts = {};    // boneId -> { rect, canvas }
    const parts = {};   // partId -> { def, geom, canvas, rect, chain?, lag... }

    // ---- Art ----------------------------------------------------------------
    function partImage(def, state) {
      // Same art rules as the flat path, so a pet cannot look different between
      // a mode that simulates and one that does not.
      if (window.PetParts && typeof window.PetParts.resolve === 'function') {
        // resolve() also STARTS the load for any name it has not seen, and
        // fires petparts:art-changed when one arrives, which brings us back
        // here through queueRebuild. So a null now is "not yet", not "never".
        const found = window.PetParts.resolve(def.img, state || null, petIndex);
        return (found && found.img) ? found.img : null;
      }
      if (!def._img) {
        const im = new Image();
        im._failed = false;
        im.onerror = () => { im._failed = true; };
        im.onload = () => { rebuild(); };
        im.src = def.img;   // asset_path_fix.js rewrites this to images/<name>
        def._img = im;
      }
      const im = def._img;
      return (im && !im._failed && im.complete && im.naturalWidth) ? im : null;
    }

    function buildPart(p) {
      const def = p.def;
      const slot = { part: p, def, chain: null, canvas: null, rect: null, lag: 0, lagVel: 0, prevAng: p.bone.ang, flapT: 0 };
      const img = def.img ? partImage(def) : null;

      if (img && p.segments > 1) {
        slot.chain = sliceChain(img, p);
        if (slot.chain) { parts[p.id] = slot; return; }
        // Fall through to the rigid path if the art could not be measured.
      }

      if (img) {
        // One rigid piece: the whole 851x1134 canvas, drawn as it was authored.
        const c = document.createElement('canvas');
        c.width = SRC.w; c.height = SRC.h;
        c.getContext('2d').drawImage(img, 0, 0, SRC.w, SRC.h);
        slot.canvas = c;
        slot.rect = def.rect || [0, 0, SRC.w, SRC.h];
        parts[p.id] = slot;
        return;
      }

      // Legacy: carve the part out of the base art with its row-run mask — the
      // same grown mask the bones were told to keep off.
      const full = maskFor(def);
      if (full && def.rect && skin) {
        const [rx, ry, rw, rh] = def.rect;
        const m = new Uint8Array(rw * rh);
        for (let y = ry; y < ry + rh; y++) {
          if (y < 0 || y >= SRC.h) continue;
          const srow = y * SRC.w, drow = (y - ry) * rw;
          for (let x = rx; x < rx + rw; x++) {
            if (x < 0 || x >= SRC.w) continue;
            if (full[srow + x]) m[drow + (x - rx)] = 1;
          }
        }
        slot.canvas = maskedCut(skin, def.rect, m);
        slot.rect = def.rect;
        parts[p.id] = slot;
        return;
      }

      delete parts[p.id];   // no art for this part: it simply does not exist
    }

    // Everything the pet is wearing is flattened into one image first, then that
    // image is cut into limbs. Doing it in that order means clothes are sliced
    // by exactly the same rule as the body, so a sleeve can never drift off its
    // arm — and it costs nothing per frame, only when the outfit changes.
    function rebuild() {
      if (!baseImg || !baseImg.complete || !baseImg.naturalWidth) return;
      dirty = false;
      if (!skin) skin = document.createElement('canvas');
      skin.width = SRC.w; skin.height = SRC.h;
      const g = skin.getContext('2d', { willReadFrequently: true });
      g.clearRect(0, 0, SRC.w, SRC.h);
      g.drawImage(baseImg, 0, 0, SRC.w, SRC.h);
      if (typeof window.drawOutfitOverlay === 'function') {
        try { window.drawOutfitOverlay(g, 'stand', 0, 0, SRC.w, SRC.h, petIndex); } catch (_) {}
      }

      const derived = deriveCuts(skin, G);
      if (!derived) { ready = false; return; }

      G.bones.forEach((b, k) => {
        const override = b.def.cut;
        if (override && override.rect && override.clip) {
          cuts[b.id] = { rect: override.rect, canvas: polyCut(skin, override.rect, override.clip) };
        } else if (derived[k]) {
          cuts[b.id] = { rect: derived[k].rect, canvas: maskedCut(skin, derived[k].rect, derived[k].mask) };
        } else {
          cuts[b.id] = null;
        }
        const c = cuts[b.id];
        if (c) {
          const A = G.rest[b.def.a];
          c.ox = c.rect[0] - A.x;    // where the cut-out sits, relative to the
          c.oy = c.rect[1] - A.y;    // joint it swings about
        }
      });

      for (const p of G.parts) buildPart(p);
      ready = true;
      resetChains();
    }

    // Art arrives asynchronously — a tail PNG is very unlikely to have loaded by
    // the time the base does, and an outfit change repaints the skin under the
    // cuts. Either way the cut artwork is now stale and has to be redone. It is
    // coalesced to one rebuild per frame because several images typically land
    // together and a rebuild reads the whole 851x1134 sprite back.
    // 'dirty' is what makes this safe next to a host that also calls rebuild()
    // on an outfit change: whoever gets there first clears it, and the other one
    // finds nothing to do instead of cutting the whole sprite up a second time.
    let rebuildQueued = false, dirty = false;
    function queueRebuild() {
      dirty = true;
      if (rebuildQueued || !baseImg) return;
      rebuildQueued = true;
      const go = () => { rebuildQueued = false; if (dirty) rebuild(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
      else setTimeout(go, 0);
    }
    window.addEventListener('petparts:art-changed', queueRebuild);
    window.addEventListener('outfit:art-changed', queueRebuild);

    // ---- Placing the rest pose ----------------------------------------------
    // The rest pose is the standing pet, in the host's pixels, wherever the body
    // currently is. Everything the solver does is relative to this.
    //
    // Landing squashes the rest pose itself rather than shoving the joints
    // about. Kicking the joints does nothing useful: the chest is nailed to the
    // host's box, so a hand yanked straight down just swings on a bone that
    // cannot move and the pet barely twitches. Compressing what it is trying to
    // stand in makes the whole body fold — and because the pose spring is still
    // weak just after a landing, the limbs arrive late and flail, which is the
    // part that reads as impact.
    function originOf(S) {
      return {
        x: S.originX != null ? S.originX : (S.petX || 0) - (S.pad || 0),
        y: S.originY != null ? S.originY : (S.petY || 0) - (S.pad || 0),
      };
    }

    function placeRest(S) {
      const fy = G.footY, cx = G.cx;
      for (const p of points) {
        if (p.chain) continue;
        const r = G.rest[p.name];
        const sx = cx + (r.x - cx) * (1 + squash * 0.55);
        const sy = fy - (fy - r.y) * (1 - squash);
        p.rx = S.petX + sx * S.scale;
        p.ry = S.petY + sy * S.scale;
      }
      placeChainRest(S);
    }

    // A chain point's rest position rides on its bone: rotate its authored
    // offset by however far that bone has turned. That is what keeps a tail
    // sitting exactly where it was drawn while the pet stands still, and what
    // gives it somewhere to spring back to once it has been flung.
    function placeChainRest(S) {
      for (const id in parts) {
        const slot = parts[id];
        if (!slot.chain) continue;
        const b = slot.part.bone;
        const A = P[b.def.a], B = P[b.def.b];
        const ang = Math.atan2(B.y - A.y, B.x - A.x) - b.ang;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const ra = G.rest[b.def.a];
        slot.chain.restPts.forEach((rp, i) => {
          const pt = slot.points[i];
          if (!pt) return;
          const dx = (rp.x - ra.x) * S.scale, dy = (rp.y - ra.y) * S.scale;
          pt.rx = A.x + dx * ca - dy * sa;
          pt.ry = A.y + dx * sa + dy * ca;
        });
      }
    }

    // Chain points live in the same 'points' array as the joints, so gravity,
    // damping, the floor and the substep accumulator all already apply to them.
    function resetChains() {
      points = points.filter(p => !p.chain);
      for (const id in parts) {
        const slot = parts[id];
        if (!slot.chain) { slot.points = null; continue; }
        slot.points = slot.chain.restPts.map((rp, i) => {
          const pt = {
            name: id + '#' + i, x: 0, y: 0, px: 0, py: 0, rx: 0, ry: 0,
            // The root of a chain is carried by its bone, never solved.
            w: i === 0 ? 0 : 1,
            chain: slot, index: i,
          };
          points.push(pt);
          return pt;
        });
      }
    }

    function snap() {
      squash = 0; squashVel = 0;
      anchorChainRoots();
      for (const p of points) { p.x = p.px = p.rx; p.y = p.py = p.ry; }
      for (const id in parts) { parts[id].lag = 0; parts[id].lagVel = 0; }
    }

    // ---- Constraints ---------------------------------------------------------
    function solveDistance(a, b, len) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const wsum = a.w + b.w;
      if (!wsum) return;
      const k = (d - len) / d / wsum;
      const ox = dx * k, oy = dy * k;
      a.x += ox * a.w; a.y += oy * a.w;
      b.x -= ox * b.w; b.y -= oy * b.w;
    }

    function solveLimits() {
      for (const b of G.bones) {
        if (!b.limit || !P[b.def.b].w) continue;
        const par = b.parent;
        if (!par) continue;
        const A = P[b.def.a], B = P[b.def.b], PA = P[par.def.a], PB = P[par.def.b];
        const parAng = Math.atan2(PB.y - PA.y, PB.x - PA.x);
        const cur = Math.atan2(B.y - A.y, B.x - A.x);
        const rel = wrap(cur - parAng - b.rel);
        const lo = b.limit[0] * DEG, hi = b.limit[1] * DEG;
        if (rel >= lo && rel <= hi) continue;
        // Swing the far end back to the edge of what the joint allows. The near
        // end is the grip and does not move — that is what keeps the limb on.
        const want = parAng + b.rel + (rel < lo ? lo : hi);
        const len = Math.hypot(B.x - A.x, B.y - A.y) || b.len;
        B.x = A.x + Math.cos(want) * len;
        B.y = A.y + Math.sin(want) * len;
      }
    }

    function solveSides(scale) {
      const C = P.chest, L = P.pelvis;
      let ux = L.x - C.x, uy = L.y - C.y;
      const n = Math.hypot(ux, uy) || 1;
      ux /= n; uy /= n;
      for (const s of G.sides) {
        const q = P[s.name];
        if (!q.w) continue;
        const d = ux * (q.y - C.y) - uy * (q.x - C.x);   // signed distance off the spine
        const want = s.sign * s.min * scale;
        if (s.sign > 0 ? d >= want : d <= want) continue;
        const push = want - d;
        q.x += -uy * push;
        q.y += ux * push;
      }
    }

    // Segment lengths, plus a spring back toward the shape the part was drawn
    // in. Length alone would let a tail fold flat against the body and stay
    // there; the stiffness pull is what gives it a shape to return to.
    function solveChains(scale) {
      for (const id in parts) {
        const slot = parts[id];
        if (!slot.chain || !slot.points) continue;
        const k = slot.def.stiffness == null ? 0.25 : slot.def.stiffness;
        const pts = slot.points;
        for (let i = 1; i < pts.length; i++) {
          const pt = pts[i];
          if (k) { pt.x += (pt.rx - pt.x) * k; pt.y += (pt.ry - pt.y) * k; }
          solveDistance(pts[i - 1], pt, slot.chain.strips[i - 1].len * scale);
        }
      }
    }

    function solveFloor(S) {
      if (S.floorY == null) return;
      for (const p of points) {
        if (!p.w || p.y <= S.floorY) continue;
        p.y = S.floorY;
        p.px = p.x + (p.px - p.x) * 0.55;   // scrape rather than skate
      }
    }

    // A chain's root is carried by its bone the same way, and for the same
    // reason: it is placed, never solved. Leaving it weightless but unplaced is
    // not the same thing — a weightless point still has gravity added to it
    // every step, so it would quietly fall away from the pet forever, dragging
    // the tail off into the floor. Its px/py are deliberately NOT reset, so it
    // keeps the velocity of the bone it rides: that is what whips the tail when
    // the body is thrown.
    function anchorChainRoots() {
      for (const id in parts) {
        const slot = parts[id];
        if (!slot.chain || !slot.points) continue;
        const root = slot.points[0];
        root.x = root.rx; root.y = root.ry;
      }
    }

    // The chest is the root and it does not simulate: it is placed exactly where
    // the host's box says it should be, every step. Everything else hangs off it
    // through the bones, which is what gives the limbs their lag — yank the body
    // sideways and the arms have to catch up, because only the chest teleported.
    function anchorRoot() {
      const c = P.chest;
      c.x = c.rx; c.y = c.ry;
    }

    // The cursor's demand, brought back inside what the limb can actually do.
    //
    // Distance is only half of it: a shoulder has a range of directions it can
    // point at all, and dragging a hand round behind the pet's back asks for an
    // angle no amount of distance clamping would fix. But the arm's reach is not
    // the shoulder's cone either — the elbow bends, so the hand can be well
    // outside where the upper arm may point. So work out the real envelope:
    // swing the upper bone as close to the target as its joint allows, then
    // clamp the target to what the lower bone can span from that elbow.
    //
    // All of it is measured from where the joint RESTS, not where it is now.
    // Measured from where it is now, the clamp would go slack the moment the
    // body began to lean and the lean would stall halfway.
    function reachable(pin, scale) {
      const r = G.reach[pin.joint];
      if (!r) return pin;
      const A = P[r.from];
      const upper = G.byId[r.chain[0]], lower = G.byId[r.chain[1]];
      if (!A || !upper || !lower) return pin;
      const L1 = upper.len * scale;
      const L2 = lower.len * scale * G.reachSlack;

      let th = Math.atan2(pin.y - A.ry, pin.x - A.rx);
      if (upper.limit) {
        const rel = wrap(th - upper.ang);
        const lo = upper.limit[0] * DEG, hi = upper.limit[1] * DEG;
        th = upper.ang + clamp(rel, lo, hi);
      }
      const ex = A.rx + Math.cos(th) * L1, ey = A.ry + Math.sin(th) * L1;

      const dx = pin.x - ex, dy = pin.y - ey;
      const d = Math.hypot(dx, dy);
      if (d <= L2) return pin;
      return { joint: pin.joint, x: ex + dx / d * L2, y: ey + dy / d * L2 };
    }

    // ...and the little that is left comes from the feet, which grip the floor
    // rather than being nailed to it. Pull hard enough and the pet shifts its
    // footing; let go and it steps back. Nailing them instead would put the
    // whole excess into the arm, which then visibly stretches.
    const FOOT_GRIP = 0.5;

    // ---- The step ------------------------------------------------------------
    function substep(h, S) {
      // Who the solver may not move. Normally that is the chest, which is the
      // root and simply goes where the host's box says. While you are pulling a
      // limb the roles swap: the FEET are what is nailed down and the chest is
      // set free, so the pull leans the whole body over instead of stretching
      // the arm. Pin both and there is nothing left to give — the arm is the
      // only thing that can move, and it tears.
      for (const p of points) p.w = p.chain ? (p.index === 0 ? 0 : 1) : 1;
      let pin = null;
      if (S.pin) {
        pin = reachable(S.pin, S.scale);
        if (P[pin.joint]) P[pin.joint].w = 0;
      } else {
        P.chest.w = 0;
      }

      const g = (T.gravity || 0) * S.scale * h * h;
      for (const p of points) {
        const vx = (p.x - p.px) * T.damping, vy = (p.y - p.py) * T.damping;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g;
      }

      // The one knob. Everything else here is the same in every mode.
      const k = S.poseK;
      swayT += h;
      const sway = Math.sin(swayT * 2 * Math.PI * T.sway.hz) * T.sway.amp * S.scale * (k > 0.3 ? 1 : 0.2);
      // Split across the constraint passes rather than applied once up front, so
      // that these many small pulls compose to the same k. It has to interleave:
      // the joint limits and the braces have wrong answers that satisfy them
      // perfectly — a limb clamped against its limit, a hip flipped to the mirror
      // side — and a rest pull that ran only before them gets overruled and the
      // pet stays knotted. Pulling between every pass gives the standing pose a
      // vote in each one, and it can always win because the standing pose
      // satisfies every constraint exactly.
      const kIter = 1 - Math.pow(1 - k, 1 / T.iterations);
      const pullToRest = () => {
        for (const p of points) {
          if (!p.w || p.chain) continue;
          p.x += (p.rx + sway - p.x) * kIter;
          p.y += (p.ry - p.y) * kIter;
        }
      };

      // Held points are placed before the passes, not after, so the rest of the
      // body has every iteration to work out how to reach them. Because they are
      // immovable, the bone constraints resolve entirely into the limb above —
      // the arm goes taut and drags the shoulder, and the body leans into it.
      if (pin) {
        const p = P[pin.joint];
        if (p) { p.x = pin.x; p.y = pin.y; }
        for (const f of ['footL', 'footR']) {
          const q = P[f];
          if (!q) continue;
          q.x += (q.rx - q.x) * FOOT_GRIP;
          q.y += (q.ry - q.y) * FOOT_GRIP;
        }
      }

      // Order matters, and it is the opposite of the obvious one. Whatever runs
      // LAST in a pass is what holds, and the rest is what gives — so the bone
      // lengths run last, because a stretched bone is the one error you can
      // actually see. A joint limit swings a joint without caring what that does
      // to the bone below it, and the braces are only there to stop the torso
      // folding, so both of those go first and give ground instead.
      for (let it = 0; it < T.iterations; it++) {
        pullToRest();
        solveLimits();
        for (const c of G.braces) solveDistance(P[c.a], P[c.b], c.len * S.scale);
        for (const b of G.bones) solveDistance(P[b.def.a], P[b.def.b], b.len * S.scale);
        solveSides(S.scale);
        // Chains hang off the finished skeleton, so they are solved after it.
        // Their root is weightless, so nothing they do can drag a limb about.
        placeChainRest(S);
        anchorChainRoots();
        solveChains(S.scale);
        solveFloor(S);
        if (!pin) anchorRoot();
      }

      // Let go of the held point and settle once more. Reach is not the only way
      // the cursor can ask for the impossible: drag a hand behind the pet's back
      // and the shoulder simply does not turn that far, and no amount of reach
      // clamping helps because the demand is angular, not a distance. So the
      // skeleton gets the final say — the hand comes off the cursor by however
      // much it must, instead of the arm coming apart. Within reach there is
      // nothing left to correct and these passes change nothing.
      if (pin) {
        const p = P[pin.joint];
        if (p) p.w = 1;
        for (let it = 0; it < 6; it++) {
          solveLimits();
          for (const c of G.braces) solveDistance(P[c.a], P[c.b], c.len * S.scale);
          for (const b of G.bones) solveDistance(P[b.def.a], P[b.def.b], b.len * S.scale);
          solveSides(S.scale);
        }
      }
    }

    // The rigid parts — a wing, a fringe — trail their bone's rotation and
    // spring back, which is much cheaper than a chain and right for something
    // stiff. 'flap' adds a slow flutter while the pet is in the air.
    function stepParts(dt, S) {
      for (const id in parts) {
        const slot = parts[id];
        if (slot.chain) continue;
        const def = slot.def;
        if (!def.lag && !def.flap) continue;
        const b = slot.part.bone;
        const PA = P[b.def.a], PB = P[b.def.b];
        const ang = Math.atan2(PB.y - PA.y, PB.x - PA.x);
        const d = wrap(ang - slot.prevAng);
        slot.prevAng = ang;
        if (def.lag) {
          // Rotating the body flings the part; it springs back and settles.
          slot.lagVel += -d * def.lag * 4 - slot.lag * 0.22;
          slot.lagVel *= 0.86;
          slot.lag += slot.lagVel;
          const cap = (def.maxLag || 20) * DEG;
          if (slot.lag > cap) { slot.lag = cap; slot.lagVel = 0; }
          if (slot.lag < -cap) { slot.lag = -cap; slot.lagVel = 0; }
        }
        if (def.flap) {
          const want = S.airborne ? 1 : 0;
          slot.flapT += (want - slot.flapT) * Math.min(1, dt * 6);
          slot.flapPhase = (slot.flapPhase || 0) + dt * 9;
        }
      }
    }

    function step(dt, S) {
      if (!ready) return;
      placeRest(S);
      acc = Math.min(acc + dt, 0.1);
      let n = 0;
      const before = points.map(p => [p.x, p.y]);
      while (acc >= T.substep && n < 6) { substep(T.substep, S); acc -= T.substep; n++; }
      if (n) {
        for (let i = 0; i < n; i++) {
          squashVel += -squash * 0.055;
          squashVel *= 0.90;
          squash += squashVel;
        }
        if (Math.abs(squash) < 0.0015 && Math.abs(squashVel) < 0.0015) { squash = 0; squashVel = 0; }
        moved = 0;
        points.forEach((p, i) => {
          if (!before[i]) return;
          moved = Math.max(moved, Math.abs(p.x - before[i][0]) + Math.abs(p.y - before[i][1]));
        });
        stepParts(dt, S);
      }
    }

    // Strength comes straight from the host's impact number.
    function kick(impact) {
      if (!ready) return;
      squash = (T.landSquash || 0) * clamp(impact, 0, 1);
      squashVel = 0;
    }

    // ---- Drawing -------------------------------------------------------------
    function drawPart(ctx, slot, S, ox, oy) {
      const b = slot.part.bone;
      const A = P[b.def.a], B = P[b.def.b];
      const ra = G.rest[b.def.a];

      if (slot.chain && slot.points) {
        // Each strip is drawn onto the segment its two points now span, so the
        // part bends along the chain instead of turning as one piece.
        slot.chain.strips.forEach((st, i) => {
          if (!st || !st.canvas) return;
          const p0 = slot.points[i], p1 = slot.points[i + 1];
          if (!p0 || !p1) return;
          const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x) - st.ang;
          ctx.save();
          ctx.translate(p0.x + ox, p0.y + oy);
          ctx.rotate(ang);
          ctx.drawImage(st.canvas,
            (st.rect[0] - st.a.x) * S.scale, (st.rect[1] - st.a.y) * S.scale,
            st.rect[2] * S.scale, st.rect[3] * S.scale);
          ctx.restore();
        });
        return;
      }

      if (!slot.canvas) return;
      const ang = Math.atan2(B.y - A.y, B.x - A.x) - b.ang;
      let spin = slot.lag || 0;
      if (slot.def.flap && slot.flapT > 0.01) {
        spin += Math.sin(slot.flapPhase || 0) * 0.30 * slot.flapT;
      }
      ctx.save();
      ctx.translate(A.x + ox, A.y + oy);
      ctx.rotate(ang);
      const anx = (slot.part.anchor.x - ra.x) * S.scale, any = (slot.part.anchor.y - ra.y) * S.scale;
      ctx.translate(anx, any); ctx.rotate(spin); ctx.translate(-anx, -any);
      ctx.drawImage(slot.canvas,
        (slot.rect[0] - ra.x) * S.scale, (slot.rect[1] - ra.y) * S.scale,
        slot.rect[2] * S.scale, slot.rect[3] * S.scale);
      ctx.restore();
    }

    function draw(ctx, S) {
      if (!ready) return false;
      const org = originOf(S);
      const ox = -org.x, oy = -org.y;
      for (const item of G.drawList) {
        if (item.kind === 'bone') {
          const b = item.ref, c = cuts[b.id];
          if (!c || !c.canvas) continue;
          const A = P[b.def.a], B = P[b.def.b];
          const ang = Math.atan2(B.y - A.y, B.x - A.x) - b.ang;
          ctx.save();
          ctx.translate(A.x + ox, A.y + oy);
          ctx.rotate(ang);
          ctx.drawImage(c.canvas, c.ox * S.scale, c.oy * S.scale,
            c.rect[2] * S.scale, c.rect[3] * S.scale);
          ctx.restore();
        } else {
          const slot = parts[item.ref.id];
          if (!slot) continue;
          // A coat over the wings, a bodysuit over a tail: the garment hides it.
          if (!item.ref.front && typeof window.outfitHidesBack === 'function'
              && window.outfitHidesBack(petIndex)) continue;
          drawPart(ctx, slot, S, ox, oy);
        }
      }
      if (debug) drawDebug(ctx, S, ox, oy);
      return true;
    }

    // ---- Picking -------------------------------------------------------------
    function segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
      t = clamp(t, 0, 1);
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      return Math.hypot(qx, qy);
    }

    // Which limb is under the cursor. Front-most wins, so a hand lying over the
    // chest is grabbed as a hand.
    function boneAt(gx, gy, scale) {
      let best = null, bd = Infinity;
      for (let i = G.drawList.length - 1; i >= 0; i--) {
        const it = G.drawList[i];
        if (it.kind !== 'bone') continue;
        const b = it.ref;
        const A = P[b.def.a], B = P[b.def.b];
        const d = segDist(gx, gy, A.x, A.y, B.x, B.y);
        if (d <= (b.def.grab || 30) * scale && d < bd) { bd = d; best = b.def; }
      }
      return best;
    }

    function handleFor(bone) { return bone ? (G.handle[bone.id] || null) : null; }

    // ---- Debug overlay -------------------------------------------------------
    function drawDebug(ctx, S, ox, oy) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      for (const b of G.bones) {
        const c = cuts[b.id];
        if (!c) continue;
        const A = P[b.def.a];
        const ang = Math.atan2(P[b.def.b].y - A.y, P[b.def.b].x - A.x) - b.ang;
        ctx.save();
        ctx.translate(A.x + ox, A.y + oy); ctx.rotate(ang);
        ctx.strokeRect(c.ox * S.scale, c.oy * S.scale, c.rect[2] * S.scale, c.rect[3] * S.scale);
        ctx.restore();
      }
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,60,60,.9)';
      ctx.beginPath();
      for (const b of G.bones) {
        ctx.moveTo(P[b.def.a].x + ox, P[b.def.a].y + oy);
        ctx.lineTo(P[b.def.b].x + ox, P[b.def.b].y + oy);
      }
      ctx.stroke();
      // Back-part chains, so a new tail can be dragged onto its art by eye.
      ctx.strokeStyle = 'rgba(255,160,0,.9)';
      ctx.beginPath();
      for (const id in parts) {
        const slot = parts[id];
        if (!slot.points) continue;
        slot.points.forEach((p, i) => { if (i) ctx.lineTo(p.x + ox, p.y + oy); else ctx.moveTo(p.x + ox, p.y + oy); });
      }
      ctx.stroke();
      ctx.fillStyle = '#0ff'; ctx.font = '9px monospace'; ctx.textBaseline = 'middle';
      for (const p of points) {
        ctx.fillStyle = p.chain ? '#fa0' : '#0ff';
        ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, 3, 0, 7); ctx.fill();
        if (!p.chain) ctx.fillText(p.name, p.x + ox + 5, p.y + oy);
      }
      if (S.floorY != null) {
        ctx.strokeStyle = 'rgba(255,255,0,.7)'; ctx.beginPath();
        ctx.moveTo(0, S.floorY + oy); ctx.lineTo(10000, S.floorY + oy); ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textBaseline = 'top';
      ctx.fillText('pose:' + G.poseName + '  ' + debugInfo, 4, 4);
      ctx.restore();
    }

    // ---- Instance ------------------------------------------------------------
    return {
      petIndex,
      get ready() { return ready && CFG.enabled !== false; },
      get moved() { return moved; },
      get busy() { return moved > (T.sleepEps || 0) || squash !== 0; },
      get points() { return P; },
      get debug() { return debug; },
      get poseName() { return G.poseName; },
      setDebug(on) { debug = !!on; },
      setDebugInfo(s) { debugInfo = s; },
      setBase(img) { baseImg = img; rebuild(); },
      // Swap poses at runtime — the artwork has to match, so this is really for
      // trying the two presets against a new base.png with the overlay open.
      setPose(name) {
        G = geometry(name);
        makePoints();
        rebuild();
      },
      // What the Ctrl+Shift+B overlay and the test harness read: where every
      // back-part chain currently is, and how far its root has drifted from the
      // bone that carries it (which must stay 0 — that is the grip).
      _chainDebug() {
        const out = {};
        for (const id in parts) {
          const slot = parts[id];
          if (!slot.chain || !slot.points) continue;
          const root = slot.points[0];
          out[id] = {
            points: slot.points.map(p => [p.x, p.y]),
            segLens: slot.chain.strips.map(s => s.len),
            rootOff: Math.hypot(root.x - root.rx, root.y - root.ry),
          };
        }
        return out;
      },
      rebuild, snap, placeRest, step, kick, draw, boneAt, handleFor,
      get footY() { return G.footY; },
      srcW: SRC.w, srcH: SRC.h,
      pose: T.pose, recoverMs: T.recoverMs, sleepEps: T.sleepEps,
    };
  }

  // ===========================================================================
  //  MODULE
  // ===========================================================================
  //  window.PetRig is itself the first pet, so an app with one pet never has to
  //  know create() exists — every call it already makes still lands.
  const first = create({ petIndex: 0 });
  const api = {
    create, geometry, config: CFG,
    // Throw away the derived skeleton so the next create() reads PET_RIG again.
    // The geometry is cached because it is identical for every pet and costs a
    // pass over the config to build; that caching is also why editing
    // PET_RIG.backParts at runtime otherwise appears to do nothing. The parts
    // preview in tools/ uses this to switch a part off and re-cut.
    resetGeometry() { for (const k in geomCache) delete geomCache[k]; },
  };
  for (const k of Object.keys(first)) {
    const d = Object.getOwnPropertyDescriptor(first, k);
    if (d && (d.get || d.set)) Object.defineProperty(api, k, d);
    else if (typeof first[k] === 'function') api[k] = first[k].bind(first);
    else Object.defineProperty(api, k, { get: () => first[k], enumerable: true });
  }
  return api;
})();
