// ===========================================================
// 🪆 ragdoll.js — a standing "active ragdoll" for the pet sprite
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
// pulls itself upright again. Moving the pet around while it stands makes the
// arms trail behind it, because the springs are soft at the hands.
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

  const NAMES = Object.keys(CFG.particles);

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
      const shift = CFG.SRC_H - CFG.SOLE_Y;   // feet stand ON the floor, not 7% above it
      for (const n of NAMES) {
        const s = CFG.particles[n];
        this.rest[n] = { x: s.x * k, y: (s.y + shift) * k, r: s.r * k, kk: s.k };
      }
      this.links = [];
      const dist = (a, b) => Math.hypot(this.rest[a].x - this.rest[b].x, this.rest[a].y - this.rest[b].y);
      for (const [a, b] of CFG.rigid) { const d = dist(a, b); this.links.push({ a, b, min: d, max: d }); }
      for (const [a, b, lo, hi] of CFG.ranges) {
        const d = dist(a, b);
        this.links.push({ a, b, min: d * lo, max: d * hi });
      }
      if (!this._init) { this._init = true; this.snapToPose(); }
      else this.snapToPose();
    }

    snapToPose() {
      for (const n of NAMES) {
        const t = this.target(n);
        this.p[n] = { x: t.x, y: t.y, px: t.x, py: t.y };
      }
      this.pin = null;
      this.settled = true;
    }

    target(n) {
      const r = this.rest[n];
      return { x: this.box.x + r.x, y: this.box.y + r.y };
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

    // Pick the joint nearest to a point (screen px) and pin it there.
    grab(wx, wy) {
      let best = null, bd = Infinity;
      for (const n of NAMES) {
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

    // Landing: the limbs and head are thrown downward by the impact (0..1).
    impact(strength) {
      const s = Math.max(0, Math.min(1, strength));
      const kick = (n, v) => { const j = this.p[n]; j.py -= v * s * this.k * 30; };
      for (const n of ['Hd', 'HL', 'HR', 'EL', 'ER']) kick(n, 0.35);
      for (const n of ['KL', 'KR']) kick(n, 0.18);
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

      for (const n of NAMES) {
        const j = this.p[n];
        let vx = j.x - j.px, vy = j.y - j.py;
        // Damp the speed *relative to the box*, so a fall or a throw isn't
        // braked by air drag but loose limbs still settle.
        vx = bx + (vx - bx) * DAMPING;
        vy = by + (vy - by) * DAMPING;
        j.px = j.x; j.py = j.y;
        j.x += vx;
        j.y += vy + g;
      }

      // The balance springs.
      for (const n of NAMES) {
        const j = this.p[n], t = this.target(n);
        const a = s * this.rest[n].kk;
        j.x += (t.x - j.x) * a;
        j.y += (t.y - j.y) * a;
      }

      for (let it = 0; it < ITERATIONS; it++) {
        this.pinJoint();
        for (const l of this.links) this.solve(l);
        this.floor();
      }
      this.pinJoint();

      this.checkSettled();
    }

    pinJoint() {
      if (!this.pin) return;
      const j = this.p[this.pin.name];
      const x = this.pin.ax + (this.box.x - this.pin.bx);
      const y = this.pin.ay + (this.box.y - this.pin.by);
      j.x = x; j.y = y;
    }

    solve(l) {
      const a = this.p[l.a], b = this.p[l.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      let target = d;
      if (d < l.min) target = l.min; else if (d > l.max) target = l.max; else return;
      const diff = (d - target) / d;
      const pa = this.pin && this.pin.name === l.a, pb = this.pin && this.pin.name === l.b;
      const wa = pa ? 0 : (pb ? 1 : 0.5), wb = pb ? 0 : (pa ? 1 : 0.5);
      a.x += dx * diff * wa; a.y += dy * diff * wa;
      b.x -= dx * diff * wb; b.y -= dy * diff * wb;
    }

    floor() {
      for (const n of NAMES) {
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
      for (const n of NAMES) {
        const j = this.p[n], t = this.target(n);
        worst = Math.max(worst, Math.hypot(j.x - t.x, j.y - t.y));
        fast = Math.max(fast, Math.hypot(j.x - j.px, j.y - j.py));
      }
      if (worst < SETTLE_DIST && fast < SETTLE_SPEED && Math.hypot(this.boxVel.x, this.boxVel.y) < 1) {
        this.snapToPose();
      }
    }

    // ---- Art -------------------------------------------------------------
    // `comp` is the finished sprite (body + clothes) on a canvas whose width
    // maps to the 851px source art; `dpr` is only used to size the parts.
    buildArt(comp) {
      const cs = comp.width / CFG.SRC_W;
      const pt = n => ({ x: CFG.particles[n].x * cs, y: CFG.particles[n].y * cs });
      const at = v => (typeof v === 'string' ? pt(v) : { x: v[0] * cs, y: v[1] * cs });
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

      const trace = (ctx, shapes, ox, oy) => {
        for (const s of shapes) {
          ctx.beginPath();
          if (s.t === 'circle') {
            const c = at(s.c);
            ctx.arc(c.x - ox, c.y - oy, s.r * cs, 0, Math.PI * 2);
          } else if (s.t === 'rect') {
            ctx.rect(s.x0 * cs - ox, s.y0 * cs - oy, (s.x1 - s.x0) * cs, (s.y1 - s.y0) * cs);
          } else {   // capsule: a thick line with round ends
            const a = at(s.a), b = at(s.b);
            ctx.lineCap = 'round';
            ctx.lineWidth = s.r * 2 * cs;
            ctx.moveTo(a.x - ox, a.y - oy);
            ctx.lineTo(b.x - ox, b.y - oy);
            ctx.strokeStyle = '#000';
            ctx.stroke();
            continue;
          }
          ctx.fillStyle = '#000';
          ctx.fill();
        }
      };

      const bounds = (shapes) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
        for (const s of shapes) {
          if (s.t === 'circle') { const c = at(s.c); add(c.x, c.y, s.r * cs); }
          else if (s.t === 'rect') { add(s.x0 * cs, s.y0 * cs, 0); add(s.x1 * cs, s.y1 * cs, 0); }
          else { const a = at(s.a), b = at(s.b); add(a.x, a.y, s.r * cs); add(b.x, b.y, s.r * cs); }
        }
        return { x0: Math.floor(x0) - 2, y0: Math.floor(y0) - 2, x1: Math.ceil(x1) + 2, y1: Math.ceil(y1) + 2 };
      };

      // Everything claimed by a limb or the head: the torso is the leftover.
      const claimed = CFG.parts.filter(p => p.shapes);
      const out = [];
      for (const part of CFG.parts) {
        let box;
        if (part.rest) box = { x0: 0, y0: 0, x1: comp.width, y1: comp.height };
        else box = bounds(part.shapes);
        const w = box.x1 - box.x0, h = box.y1 - box.y0;
        const c = mk(w, h);
        const ctx = c.getContext('2d');

        if (part.rest) {
          ctx.drawImage(comp, 0, 0);
          ctx.globalCompositeOperation = 'destination-out';
          for (const o of claimed) trace(ctx, o.shapes, 0, 0);
          // Put back the root circles so a swinging limb leaves skin behind.
          ctx.globalCompositeOperation = 'source-over';
          for (const o of claimed) {
            if (!o.keepRoot) continue;
            const cc = at(o.keepRoot.c);
            ctx.save();
            ctx.beginPath();
            ctx.arc(cc.x, cc.y, o.keepRoot.r * cs, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(comp, 0, 0);
            ctx.restore();
          }
        } else {
          trace(ctx, part.shapes, box.x0, box.y0);
          ctx.globalCompositeOperation = 'source-in';
          ctx.drawImage(comp, -box.x0, -box.y0);
        }

        const pv = pt(part.pivot), ch = pt(part.child);
        out.push({
          id: part.id, pivot: part.pivot, child: part.child, canvas: c,
          ox: pv.x - box.x0, oy: pv.y - box.y0,           // pivot inside the part's canvas
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
      for (const part of this.parts) {
        const a = this.p[part.pivot], b = this.p[part.child];
        const ang = Math.atan2(b.y - a.y, b.x - a.x) - part.restAngle;
        ctx.save();
        ctx.translate(a.x - originX, a.y - originY);
        ctx.rotate(ang);
        ctx.drawImage(part.canvas, -part.ox * inv, -part.oy * inv, part.canvas.width * inv, part.canvas.height * inv);
        ctx.restore();
      }
    }
  }

  const api = { Ragdoll, STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetRagdoll = api;
})(typeof window !== 'undefined' ? window : globalThis);
