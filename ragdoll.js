// ===========================================================
// 🪆 ragdoll.js — a standing "active ragdoll" built from the part PNGs
// ===========================================================
// The pet is a skeleton of joints (see ragdoll_config.js) simulated with
// position-based dynamics: every joint is a point, every bone a distance
// constraint, and gravity pulls on all of it. On top of that sits the part that
// keeps it standing — each joint is also pulled back toward the standing pose
// by a spring whose strength (`stiffness`, 0..1) is what the pet "decides":
//
//   stiffness 1    standing: the pose wins, the pet is just the picture
//   stiffness ~0   limp: pure ragdoll, it dangles, tumbles and piles up
//
// Grab the pet and it goes limp and hangs from the exact joint you picked up.
// Let go and it falls limp; once it lands the stiffness ramps back up and it
// pulls itself upright again.
//
// Besides the skeleton there are "soft" joints — the chest and the end of the
// back hair — that hang off the body on springs instead of being pulled to the
// box. They lag, overshoot and settle, which is all the chest bounce and hair
// sway are: the body moves, they follow a moment later.
//
// The sim is in screen pixels and knows nothing about Electron — main.js still
// owns where the pet's box is; this only decides how the body hangs off it. The
// file also loads in Node (module.exports) so the physics can be tested without
// a window.
// ===========================================================

(function (root) {
  'use strict';

  const CFG = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./ragdoll_config.js')
    : root.RAGDOLL_CONFIG;

  const STEP = 1 / 60;
  const GRAVITY = 2600;           // px/s², the same as main.js, so a falling box and a falling limb agree
  const DAMPING = 0.92;           // share of a joint's speed (relative to the box) kept per step
  const FLOOR_FRICTION = 0.6;     // sideways speed kept per step while touching the floor
  const ITERATIONS = 8;
  const STIFF_HELD = 0.012;       // dangling from the cursor
  const STIFF_AIR = 0.03;         // in the air after a throw
  const GET_UP_RATE = 1.3;        // stiffness per second once back on the floor
  const SETTLE_DIST = 0.6;        // px from the standing pose that counts as "standing"
  const SETTLE_SPEED = 0.06;      // px/step
  const DEG = Math.PI / 180;

  const SKEL = Object.keys(CFG.particles);
  const SOFT = Object.keys(CFG.soft);
  const ALL = SKEL.concat(SOFT);

  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  class Ragdoll {
    constructor() {
      this.k = 1;                          // source px -> screen px
      this.box = { x: 0, y: 0 };           // top-left of the pet's box, screen px
      this.boxVel = { x: 0, y: 0 };        // px/s, smoothed
      this.boxStamp = 0;
      this.idleSteps = 0;                  // steps since the box last moved
      this.floorY = Infinity;
      this.held = false;
      this.airborne = false;
      this.stiffness = 1;
      this.pin = null;
      this.settled = false;
      this.acc = 0;
      this.p = {};                         // live joints
      this.rest = {};                      // rest offsets from the box, screen px
      this.links = [];
      this.parts = null;                   // sliced art, built by buildArt()
      this._init = false;
    }

    // ---- Setup -----------------------------------------------------------
    // k scales the 851×1134 source art to the on-screen sprite height.
    layout(k) {
      if (k === this.k && this._init) return;
      this.k = k;
      const shift = CFG.SRC_H - CFG.SOLE_Y;   // feet stand ON the floor
      const put = (n, s, kk) => { this.rest[n] = { x: s.x * k, y: (s.y + shift) * k, r: s.r * k, kk }; };
      for (const n of SKEL) put(n, CFG.particles[n], CFG.particles[n].k);
      for (const n of SOFT) { put(n, CFG.soft[n], CFG.soft[n].k); this.rest[n].max = CFG.soft[n].max * k; }
      this.links = CFG.rigid.map(([a, b]) => {
        const d = Math.hypot(this.rest[a].x - this.rest[b].x, this.rest[a].y - this.rest[b].y);
        return { a, b, len: d };
      });
      this._init = true;
      this.snapToPose();
    }

    snapToPose() {
      for (const n of SKEL) {
        const t = this.target(n);
        this.p[n] = { x: t.x, y: t.y, px: t.x, py: t.y };
      }
      for (const n of SOFT) {
        const t = this.softTarget(n);
        this.p[n] = { x: t.x, y: t.y, px: t.x, py: t.y };
      }
      this.pin = null;
      this.settled = true;
    }

    target(n) {
      const r = this.rest[n];
      return { x: this.box.x + r.x, y: this.box.y + r.y };
    }

    // ---- Frames ----------------------------------------------------------
    restAng(a, b) { return Math.atan2(this.rest[b].y - this.rest[a].y, this.rest[b].x - this.rest[a].x); }
    ang(a, b) { return Math.atan2(this.p[b].y - this.p[a].y, this.p[b].x - this.p[a].x); }

    // How far the torso (or the head) has turned from standing, in radians.
    frameAngle(frame) {
      return frame === 'head'
        ? this.ang('N', 'Hd') - this.restAng('N', 'Hd')
        : this.ang('N', 'P') - this.restAng('N', 'P');
    }

    // Where a soft joint would sit if it were bolted to its frame.
    softTarget(n) {
      const s = CFG.soft[n];
      const th = this.frameAngle(s.anchor);
      const dx = this.rest[n].x - this.rest.N.x, dy = this.rest[n].y - this.rest.N.y;
      const c = Math.cos(th), si = Math.sin(th);
      return { x: this.p.N.x + dx * c - dy * si, y: this.p.N.y + dx * si + dy * c };
    }

    // ---- Inputs from the scene ------------------------------------------
    // `now` is a millisecond timestamp, used to estimate how fast the box moves.
    setBox(x, y, now) {
      if (x === this.box.x && y === this.box.y) return;
      const dt = this.boxStamp ? Math.max((now - this.boxStamp) / 1000, 1 / 240) : 0;
      if (dt > 0 && dt < 0.25) {
        const vx = (x - this.box.x) / dt, vy = (y - this.box.y) / dt;
        this.boxVel.x += (vx - this.boxVel.x) * 0.5;
        this.boxVel.y += (vy - this.boxVel.y) * 0.5;
      } else {
        this.boxVel.x = 0; this.boxVel.y = 0;
      }
      this.boxStamp = now;
      this.idleSteps = 0;
      this.box.x = x; this.box.y = y;
      this.settled = false;
    }

    setFloor(y) { if (y !== this.floorY) { this.floorY = y; this.settled = false; } }

    // held: the cursor has it. airborne: off the floor with gravity on.
    setMode(held, airborne) {
      if (held !== this.held || airborne !== this.airborne) this.settled = false;
      this.held = held;
      this.airborne = airborne;
    }

    // Pick the skeleton joint nearest to a point (screen px) and pin it there.
    grab(wx, wy) {
      let best = null, bd = Infinity;
      for (const n of SKEL) {
        const j = this.p[n];
        const d = Math.hypot(j.x - wx, j.y - wy) - this.rest[n].r * 0.6;
        if (d < bd) { bd = d; best = n; }
      }
      const j = this.p[best];
      this.pin = { name: best, ax: j.x, ay: j.y, bx: this.box.x, by: this.box.y };
      this.settled = false;
      return best;
    }

    release() { this.pin = null; this.settled = false; }

    // Landing: the limbs, head and chest are thrown downward by the impact (0..1).
    impact(strength) {
      const s = Math.max(0, Math.min(1, strength));
      const kick = (n, v) => { const j = this.p[n]; j.py -= v * s * this.k * 30; };
      for (const n of ['Hd', 'HL', 'HR']) kick(n, 0.35);
      for (const n of ['CL', 'CR']) kick(n, 0.5);
      kick('Hr', 0.3);
      kick('P', 0.12);
      this.settled = false;
    }

    // ---- Simulation ------------------------------------------------------
    // Advance by real elapsed seconds. Returns true while anything is moving.
    tick(dt) {
      if (this.settled) return false;
      this.acc += Math.min(dt, 0.05);
      let guard = 0;
      while (this.acc >= STEP && guard++ < 6) { this.acc -= STEP; this.step(STEP); }
      return !this.settled;
    }

    step(dt) {
      // Stiffness: collapses at once when grabbed or thrown, climbs back while
      // the pet is on its feet.
      const want = this.held ? STIFF_HELD : this.airborne ? STIFF_AIR : 1;
      if (want < this.stiffness) this.stiffness += (want - this.stiffness) * Math.min(1, dt * 14);
      else this.stiffness = Math.min(want, this.stiffness + GET_UP_RATE * dt);
      const s = this.stiffness;

      // The box speed is only refreshed when the box moves, so let it fade once
      // the box has stopped (a few frames of grace for uneven state updates).
      if (++this.idleSteps > 4) { this.boxVel.x *= 0.7; this.boxVel.y *= 0.7; }

      // A standing pet holds itself up, so gravity only wins as the stiffness
      // drops — otherwise the soft hands would sag below the pose forever.
      const g = GRAVITY * dt * dt * (1 - s);
      const bx = this.boxVel.x * dt, by = this.boxVel.y * dt;

      for (const n of ALL) {
        const j = this.p[n];
        let vx = j.x - j.px, vy = j.y - j.py;
        // Damp the speed *relative to the box*, so a fall or a throw isn't
        // braked by air drag but loose joints still settle.
        vx = bx + (vx - bx) * DAMPING;
        vy = by + (vy - by) * DAMPING;
        j.px = j.x; j.py = j.y;
        j.x += vx;
        j.y += vy + g;
      }

      // The balance springs pull the skeleton to the standing pose...
      for (const n of SKEL) {
        const j = this.p[n], t = this.target(n);
        const a = s * this.rest[n].kk;
        j.x += (t.x - j.x) * a;
        j.y += (t.y - j.y) * a;
      }
      // ...and the soft joints to wherever their part of the body has got to.
      for (const n of SOFT) {
        const j = this.p[n], t = this.softTarget(n);
        const a = this.rest[n].kk;
        j.x += (t.x - j.x) * a;
        j.y += (t.y - j.y) * a;
      }

      for (let it = 0; it < ITERATIONS; it++) {
        this.pinJoint();
        for (const l of this.links) this.solve(l);
        for (const lim of CFG.limits) this.limit(lim);
        this.clampSoft();
        this.floor();
      }
      this.pinJoint();

      this.checkSettled();
    }

    pinJoint() {
      if (!this.pin) return;
      const j = this.p[this.pin.name];
      j.x = this.pin.ax + (this.box.x - this.pin.bx);
      j.y = this.pin.ay + (this.box.y - this.pin.by);
    }

    solve(l) {
      const a = this.p[l.a], b = this.p[l.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - l.len) / d;
      const pa = this.pin && this.pin.name === l.a, pb = this.pin && this.pin.name === l.b;
      const wa = pa ? 0 : (pb ? 1 : 0.5), wb = pb ? 0 : (pa ? 1 : 0.5);
      a.x += dx * diff * wa; a.y += dy * diff * wa;
      b.x -= dx * diff * wb; b.y -= dy * diff * wb;
    }

    // Keep a limb within the angles it is allowed, relative to its frame. When the
    // far end is held by the cursor the limb may go further (`held` in the
    // config) and the BODY is swung to respect it, so a pet picked up by the hand
    // hangs with that arm raised rather than bent back. A limb with no `held`
    // range is left alone while its end is held.
    limit(L) {
      const tipHeld = this.pin && this.pin.name === L.tip;
      let lo = L.lo, hi = L.hi;
      if (tipHeld) {
        if (L.held === undefined) return;
        lo = -L.held; hi = L.held;
      }
      const piv = this.p[L.pivot], tip = this.p[L.tip];
      const frame = this.frameAngle(L.frame);
      const base = this.restAng(L.pivot, L.tip) + frame;
      const cur = Math.atan2(tip.y - piv.y, tip.x - piv.x);
      const d = wrap(cur - base);
      if (d >= lo * DEG && d <= hi * DEG) return;
      const a = base + Math.max(lo * DEG, Math.min(hi * DEG, d));
      const len = Math.hypot(tip.x - piv.x, tip.y - piv.y);
      if (tipHeld) {
        piv.x = tip.x - Math.cos(a) * len;
        piv.y = tip.y - Math.sin(a) * len;
      } else {
        tip.x = piv.x + Math.cos(a) * len;
        tip.y = piv.y + Math.sin(a) * len;
      }
    }

    clampSoft() {
      for (const n of SOFT) {
        const j = this.p[n], t = this.softTarget(n), max = this.rest[n].max;
        const dx = j.x - t.x, dy = j.y - t.y, d = Math.hypot(dx, dy);
        if (d > max) { j.x = t.x + dx / d * max; j.y = t.y + dy / d * max; }
      }
    }

    floor() {
      for (const n of ALL) {
        const j = this.p[n];
        const lim = this.floorY - this.rest[n].r;
        if (j.y > lim) {
          j.y = lim;
          // Friction: scrub sideways speed while lying or standing on the floor.
          j.px = j.x - (j.x - j.px) * FLOOR_FRICTION;
        }
      }
    }

    checkSettled() {
      if (this.held || this.airborne || this.pin || this.stiffness < 1) return;
      let worst = 0, fast = 0;
      for (const n of SKEL) {
        const j = this.p[n], t = this.target(n);
        worst = Math.max(worst, Math.hypot(j.x - t.x, j.y - t.y));
      }
      for (const n of SOFT) {
        const j = this.p[n], t = this.softTarget(n);
        worst = Math.max(worst, Math.hypot(j.x - t.x, j.y - t.y));
      }
      for (const n of ALL) { const j = this.p[n]; fast = Math.max(fast, Math.hypot(j.x - j.px, j.y - j.py)); }
      if (worst < SETTLE_DIST && fast < SETTLE_SPEED && Math.hypot(this.boxVel.x, this.boxVel.y) < 1) {
        this.snapToPose();
      }
    }

    // ---- Art -------------------------------------------------------------
    // imgs: { <file name>: loaded image } for the parts that exist.
    // cloth: a canvas with only the clothes drawn on it (or null), the same
    // size as the scaled 851×1134 sprite — its pixels are handed to whichever
    // part's region they fall in, so a sleeve moves with the arm.
    // cs: canvas pixels per source pixel.
    buildArt(imgs, cloth, cs) {
      const CW = Math.round(CFG.SRC_W * cs), CH = Math.round(CFG.SRC_H * cs);
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
      const mkRead = (w, h) => { const c = mk(w, h); return { c, x: c.getContext('2d', { willReadFrequently: true }) }; };

      const bboxOf = (ctx) => {
        const d = ctx.getImageData(0, 0, CW, CH).data;
        let x0 = CW, y0 = CH, x1 = -1, y1 = -1;
        for (let y = 0; y < CH; y++) {
          for (let x = 0; x < CW; x++) {
            if (d[(y * CW + x) * 4 + 3] > 6) {
              if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
      };

      const shape = (ctx, r) => {
        ctx.beginPath();
        if (r.t === 'ellipse') ctx.ellipse(r.cx * cs, r.cy * cs, r.rx * cs, r.ry * cs, 0, 0, Math.PI * 2);
        else ctx.rect(r.x0 * cs, r.y0 * cs, (r.x1 - r.x0) * cs, (r.y1 - r.y0) * cs);
        ctx.fill();
      };

      const regionParts = CFG.parts.filter(p => p.region && imgs[p.file]);
      const carried = CFG.parts.filter(p => p.carry && imgs[p.file]);
      const bodyPart = CFG.parts.find(p => p.rest);
      const bodyImg = bodyPart && imgs[bodyPart.file];
      const out = [];
      for (const part of CFG.parts) {
        const img = imgs[part.file];
        if (!img) continue;

        const art = mkRead(CW, CH);
        const putCarry = () => {
          art.x.save();
          art.x.beginPath();
          art.x.rect(part.carry.x0 * cs, part.carry.y0 * cs, (part.carry.x1 - part.carry.x0) * cs, (part.carry.y1 - part.carry.y0) * cs);
          art.x.clip();
          art.x.drawImage(bodyImg, 0, 0, CW, CH);
          art.x.restore();
        };
        if (part.carry && part.carryBelow && bodyImg) putCarry();
        art.x.drawImage(img, 0, 0, CW, CH);
        if (part.rest) {
          // The lumps that travel with the limbs are taken out of the torso...
          art.x.globalCompositeOperation = 'destination-out';
          for (const o of carried) shape(art.x, o.carry);
          art.x.globalCompositeOperation = 'source-over';
        } else if (part.carry && !part.carryBelow && bodyImg) {
          // ...and put on top of the limb that carries them.
          putCarry();
        }
        let box = bboxOf(art.x);

        // The clothes that belong to this part.
        let worn = null;
        if (cloth) {
          const w = mkRead(CW, CH);
          w.x.drawImage(cloth, 0, 0);
          if (part.region) {
            w.x.globalCompositeOperation = 'destination-in';
            shape(w.x, part.region);
          } else if (part.rest) {
            // The body takes whatever no other part claimed.
            w.x.globalCompositeOperation = 'destination-out';
            for (const o of regionParts) shape(w.x, o.region);
          } else {
            w.x.clearRect(0, 0, CW, CH);
          }
          const wb = bboxOf(w.x);
          if (wb) { worn = w.c; box = box ? { x0: Math.min(box.x0, wb.x0), y0: Math.min(box.y0, wb.y0), x1: Math.max(box.x1, wb.x1), y1: Math.max(box.y1, wb.y1) } : wb; }
        }
        if (!box) continue;

        const c = mk(box.x1 - box.x0, box.y1 - box.y0);
        const cx = c.getContext('2d');
        cx.drawImage(art.c, -box.x0, -box.y0);
        if (worn) cx.drawImage(worn, -box.x0, -box.y0);

        const pv = CFG.particles[part.pivot];
        const ch = CFG.particles[part.child] || CFG.soft[part.child];
        out.push({
          id: part.id, pivot: part.pivot, child: part.child, offset: part.offset, canvas: c,
          ox: pv.x * cs - box.x0, oy: pv.y * cs - box.y0,       // pivot inside the part's canvas
          restAngle: Math.atan2(ch.y - pv.y, ch.x - pv.x),
        });
      }
      this.parts = out;
      this.artScale = cs;
    }

    // Draw onto `ctx`, whose origin sits at screen (originX, originY) and whose
    // units are CSS px. Parts are stored at device resolution, hence 1/dpr.
    draw(ctx, originX, originY, dpr) {
      if (!this.parts) return;
      const inv = 1 / dpr;
      const th = this.frameAngle('torso');
      for (const part of this.parts) {
        const a = this.p[part.pivot], b = this.p[part.child];
        let ax = a.x, ay = a.y, ang;
        if (part.offset) {
          // The chest: turns with the torso, then slips by however far its
          // soft joint has strayed from where it would sit if bolted on.
          const t = this.softTarget(part.offset), j = this.p[part.offset];
          ax += j.x - t.x; ay += j.y - t.y;
          ang = th;
        } else {
          ang = Math.atan2(b.y - a.y, b.x - a.x) - part.restAngle;
        }
        ctx.save();
        ctx.translate(ax - originX, ay - originY);
        ctx.rotate(ang);
        ctx.drawImage(part.canvas, -part.ox * inv, -part.oy * inv, part.canvas.width * inv, part.canvas.height * inv);
        ctx.restore();
        if (part.id === 'body') this.drawEdges(ctx, originX, originY, th);
      }
    }

    // The outline that closes the torso where an arm has moved off it.
    drawEdges(ctx, originX, originY, th) {
      const N = CFG.particles.N, n = this.p.N;
      for (const e of CFG.edges || []) {
        const base = this.restAng(e.pivot, e.tip) + th;
        const d = Math.abs(wrap(this.ang(e.pivot, e.tip) - base)) / DEG;
        const a = Math.max(0, Math.min(1, (d - 20) / 20));
        if (a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(n.x - originX, n.y - originY);
        ctx.rotate(th);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = e.w * this.k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo((e.from[0] - N.x) * this.k, (e.from[1] - N.y) * this.k);
        ctx.lineTo((e.to[0] - N.x) * this.k, (e.to[1] - N.y) * this.k);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const api = { Ragdoll, STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetRagdoll = api;
})(typeof window !== 'undefined' ? window : globalThis);
