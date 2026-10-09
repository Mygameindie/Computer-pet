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
  const DAMPING_STILL = 0.75;     // the same while held and the cursor is still
  const HELD_SWING_MAX = 1200;    // px/s (at the default pet size) a held body may move round the held point
  const HELD_STILL_STEPS = 30;    // steps (half a second) without the box moving before that kicks in

  const FLOOR_FRICTION = 0.6;     // sideways speed kept per step while touching the floor
  const FLOOR_SINK = 40;          // px below the floor past which a joint is lifted out with no speed
  const ITERATIONS = 8;
  const STIFF_HELD = 0.012;       // dangling from the cursor
  const STIFF_AIR = 0.03;         // in the air after a throw
  const GET_UP_RATE = 0.9;        // stiffness per second once back on the floor
  const LIE_STILL = 0.4;          // seconds it lies there after landing limp, before getting up
  const JOINT_FRICTION = 0.9;     // share of a limb's swing (relative to its joint) kept per step while limp
  const SETTLE_DIST = 0.6;        // px from the standing pose that counts as "standing"
  const SETTLE_SPEED = 0.06;      // px/step
  const DEG = Math.PI / 180;

  const SKEL = Object.keys(CFG.particles);
  const SOFT = Object.keys(CFG.soft);
  const ALL = SKEL.concat(SOFT);
  const SIDED = ['SL', 'SR', 'HipL', 'HipR'];   // joints that belong on one side of the spine
  const ARM_LIMITS = CFG.limits.filter(L => L.tip === 'HL' || L.tip === 'HR');

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
      this.groundT = 0;                    // seconds on the floor since it was last held or airborne
      this.up = null;                      // getting up: how far the standing pose is still turned/shifted
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
      const put = (n, s, kk) => { this.rest[n] = { x: s.x * k, y: (s.y + shift) * k, r: s.r * k, kk, im: 1 / (s.m || 1), wake: s.wake || 0 }; };
      for (const n of SKEL) put(n, CFG.particles[n], CFG.particles[n].k);
      for (const n of SOFT) {
        put(n, CFG.soft[n], CFG.soft[n].k);
        this.rest[n].max = CFG.soft[n].max * k;
        this.rest[n].maxX = (CFG.soft[n].maxX === undefined ? CFG.soft[n].max : CFG.soft[n].maxX) * k;
        this.rest[n].gs = CFG.soft[n].gravity === undefined ? 1 : CFG.soft[n].gravity;
      }
      this.links = CFG.rigid.map(([a, b]) => {
        const d = Math.hypot(this.rest[a].x - this.rest[b].x, this.rest[a].y - this.rest[b].y);
        return { a, b, len: d };
      });
      // Which side of the spine (neck to pelvis) each shoulder and hip is on.
      const ax = this.rest.P.x - this.rest.N.x, ay = this.rest.P.y - this.rest.N.y;
      this.sideOf = {};
      for (const name of SIDED) {
        this.sideOf[name] = Math.sign(ax * (this.rest[name].y - this.rest.N.y) - ay * (this.rest[name].x - this.rest.N.x));
      }
      this._init = true;
      this.snapToPose();
    }

    snapToPose() {
      this.up = null;
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

    // Where joint n would be standing. While getting up, that standing pose is
    // turned by `up.a` about the pelvis and shifted by `up.ox/oy`, both shrinking
    // to nothing, so the pet rises from wherever it lies instead of being yanked
    // straight to its feet.
    target(n) {
      const r = this.rest[n];
      const up = this.up;
      if (!up) return { x: this.box.x + r.x, y: this.box.y + r.y };
      const pr = this.rest.P;
      const dx = r.x - pr.x, dy = r.y - pr.y;
      const c = Math.cos(up.a), si = Math.sin(up.a);
      return {
        x: this.box.x + pr.x + up.ox + dx * c - dy * si,
        y: this.box.y + pr.y + up.oy + dx * si + dy * c,
      };
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
      // Back on the floor after going limp: lie there a moment, then get up.
      this.groundT = (this.held || this.airborne) ? 0 : this.groundT + dt;
      const lying = this.groundT < LIE_STILL && this.stiffness < 0.6;
      const want = this.held ? STIFF_HELD : this.airborne ? STIFF_AIR : lying ? this.stiffness : 1;
      if (want < this.stiffness) this.stiffness += (want - this.stiffness) * Math.min(1, dt * 14);
      else this.stiffness = Math.min(want, this.stiffness + GET_UP_RATE * dt);
      const s = this.stiffness;

      // Getting up: start from the pose it is lying in and turn upright the
      // short way round at a steady pace. Pulled straight to its standing pose,
      // a pet lying down was flung up off the floor and, if it lay head-down,
      // swung most of the way round to get there.
      if (this.held || this.airborne || lying || s >= 1 && !this.up) {
        if (this.held || this.airborne || lying) this.up = null;
      } else if (!this.up) {
        const pr = this.rest.P;
        const a = wrap(this.frameAngle('torso'));
        const ox = this.p.P.x - (this.box.x + pr.x), oy = this.p.P.y - (this.box.y + pr.y);
        this.up = { a, ox, oy, a0: a, ox0: ox, oy0: oy, s0: Math.min(s, 0.95) };
      }
      if (this.up) {
        // Turned and shifted back in step with the stiffness coming back, so
        // the body can follow it the whole way rather than being snapped up
        // once it is stiff enough to.
        const up = this.up;
        const left = 1 - Math.max(0, Math.min(1, (s - up.s0) / (1 - up.s0)));
        up.a = up.a0 * left; up.ox = up.ox0 * left; up.oy = up.oy0 * left;
        if (left === 0) this.up = null;
      }

      // The box speed is only refreshed when the box moves, so let it fade once
      // the box has stopped (a few frames of grace for uneven state updates).
      if (++this.idleSteps > 4) { this.boxVel.x *= 0.7; this.boxVel.y *= 0.7; }

      // A standing pet holds itself up, so gravity only wins as the stiffness
      // drops — otherwise the soft hands would sag below the pose forever.
      // Each joint wakes at its own point of the get-up (feet first, arms last).
      const sOf = n => {
        const w = this.rest[n].wake;
        return s >= 1 ? 1 : Math.max(0, Math.min(1, (s - w) / (1 - w)));
      };
      const g = GRAVITY * dt * dt;
      const bx = this.boxVel.x * dt, by = this.boxVel.y * dt;

      // Held still by the cursor, a body jammed against the floor can keep
      // trembling between the floor and its joint limits; once the cursor has
      // been still for a moment, damp it hard so it comes to rest.
      const damp = this.held && this.idleSteps > HELD_STILL_STEPS ? DAMPING_STILL : DAMPING;
      for (const n of ALL) {
        const j = this.p[n];
        let vx = j.x - j.px, vy = j.y - j.py;
        // Damp the speed *relative to the box*, so a fall or a throw isn't
        // braked by air drag but loose joints still settle.
        vx = bx + (vx - bx) * damp;
        vy = by + (vy - by) * damp;
        j.px = j.x; j.py = j.y;
        j.x += vx;
        const lift = SKEL.includes(n) ? 1 - sOf(n) : (1 - s) * (this.rest[n].gs === undefined ? 1 : this.rest[n].gs);
        j.y += vy + g * lift;
      }

      // The balance springs pull the skeleton to the standing pose...
      for (const n of SKEL) {
        const j = this.p[n], t = this.target(n);
        const a = sOf(n) * this.rest[n].kk;
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
        this.keepSides();
        for (const lim of CFG.limits) this.limit(lim);
        this.clampSoft();
        this.floor();
      }
      this.pinJoint();
      // The arms get the last word: the bones solved after their limit could
      // carry an arm over the head or into the body, and once it was there the
      // limits pulled it the wrong way and the body went spinning.
      for (const lim of ARM_LIMITS) this.limit(lim, true);

      // Joint friction: a loose limb's swing about its joint dies down instead
      // of whipping on, which is most of what makes a real body look heavy.
      if (s < 1) {
        for (const L of CFG.limits) {
          const piv = this.p[L.pivot], tip = this.p[L.tip];
          if (this.pin && this.pin.name === L.tip) continue;
          const vpx = piv.x - piv.px, vpy = piv.y - piv.py;
          const rx = (tip.x - tip.px) - vpx, ry = (tip.y - tip.py) - vpy;
          tip.px = tip.x - (vpx + rx * JOINT_FRICTION);
          tip.py = tip.y - (vpy + ry * JOINT_FRICTION);
        }
      }

      this.capHeldSwing(dt);
      this.checkSettled();
    }

    // A body hanging from the cursor swings round the held point like a
    // pendulum, and a cursor moving in circles can pump it until it loops right
    // over the top and keeps spinning. To loop, a pendulum this size needs about
    // 1800 px/s at the bottom, so its speed round the held point is capped below
    // that: it swings as much as you like but can't go all the way round.
    capHeldSwing(dt) {
      if (!this.pin) return;
      const pj = this.p[this.pin.name];
      const pvx = pj.x - pj.px, pvy = pj.y - pj.py;
      const max = HELD_SWING_MAX * dt * this.k / (250 / 1134);
      for (const n of ALL) {
        if (n === this.pin.name) continue;
        const j = this.p[n];
        const rx = (j.x - j.px) - pvx, ry = (j.y - j.py) - pvy;
        const sp = Math.hypot(rx, ry);
        if (sp <= max) continue;
        const f = max / sp;
        j.px = j.x - (pvx + rx * f);
        j.py = j.y - (pvy + ry * f);
      }
    }

    // Every bone length can be kept with the torso turned inside out: a shoulder
    // or hip flipped over the spine to the other side, the body's mirror image.
    // Nothing pulled it back from there, so the arms crossed each other and
    // came out through the body. Put any joint that has crossed the spine (the
    // neck-pelvis line) back on its own side, mirrored across it.
    keepSides() {
      const n = this.p.N, pl = this.p.P;
      const ax = pl.x - n.x, ay = pl.y - n.y;
      const len2 = ax * ax + ay * ay;
      if (len2 < 1e-6) return;
      for (const name of SIDED) {
        const j = this.p[name];
        const side = ax * (j.y - n.y) - ay * (j.x - n.x);
        if (Math.sign(side) === this.sideOf[name]) continue;
        // Mirror a point (and where it was, so it isn't thrown) across a line.
        const mirror = (q, ox, oy, dx, dy) => {
          const d2 = dx * dx + dy * dy || 1e-6;
          for (const [kx, ky] of [['x', 'y'], ['px', 'py']]) {
            const t = ((q[kx] - ox) * dx + (q[ky] - oy) * dy) / d2;
            q[kx] = 2 * (ox + dx * t) - q[kx];
            q[ky] = 2 * (oy + dy * t) - q[ky];
          }
        };
        if (this.pin && this.pin.name === name) continue;   // held by the cursor: leave it
        mirror(j, n.x, n.y, ax, ay);
      }
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
      // Heavier joints move less: split the correction by inverse mass.
      // A soft joint (the hair) hangs off the body but never drags it: it is
      // pulled by a spring that turns with the body, and letting it push back
      // fed energy into the skeleton, so a held pet never stopped wobbling.
      const ia = (this.pin && this.pin.name === l.a) || SOFT.includes(l.b) ? 0 : this.rest[l.a].im;
      const ib = (this.pin && this.pin.name === l.b) || SOFT.includes(l.a) ? 0 : this.rest[l.b].im;
      const sum = ia + ib || 1;
      const wa = ia / sum, wb = ib / sum;
      a.x += dx * diff * wa; a.y += dy * diff * wa;
      b.x -= dx * diff * wb; b.y -= dy * diff * wb;
    }

    // Keep a limb within the angles it is allowed, relative to its frame. When the
    // far end is held by the cursor the limb may go further (`held` in the
    // config) and the BODY is swung to respect it, so a pet picked up by the hand
    // hangs with that arm raised rather than bent back. A limb with no `held`
    // range is left alone while its end is held.
    limit(L, last) {
      const tipHeld = this.pin && this.pin.name === L.tip;
      // On the last pass only free arms are fixed (a held arm is handled by
      // swinging the body, which needs the bone solve that follows it).
      if (last && tipHeld) return;
      let lo = L.lo, hi = L.hi;
      if (tipHeld) {
        // Only the side named in heldLo/heldHi is widened (the arm may go further
        // UP when the pet hangs from that hand, never further down into the body).
        if (L.held === undefined && L.heldLo === undefined && L.heldHi === undefined) return;
        if (L.held !== undefined) { lo = -L.held; hi = L.held; }
        if (L.heldLo !== undefined) lo = L.heldLo;
        if (L.heldHi !== undefined) hi = L.heldHi;
      }
      const piv = this.p[L.pivot], tip = this.p[L.tip];
      const frame = this.frameAngle(L.frame);
      const base = this.restAng(L.pivot, L.tip) + frame;
      const cur = Math.atan2(tip.y - piv.y, tip.x - piv.x);
      const d = wrap(cur - base);
      if (d >= lo * DEG && d <= hi * DEG) return;
      // Snap to whichever limit is nearer going round the circle. A plain clamp
      // picks the wrong one once the limb is more than halfway round, and the
      // body then gets flung across to the far side every step — that is what
      // made a pet held by its hand spin.
      const toLo = Math.abs(wrap(d - lo * DEG)), toHi = Math.abs(wrap(d - hi * DEG));
      const a = base + (toLo < toHi ? lo : hi) * DEG;
      const len = Math.hypot(tip.x - piv.x, tip.y - piv.y);
      if (tipHeld) {
        // Turn the whole body (everything but the held hand) about the
        // shoulder until the arm is back in range. Turning it as one piece
        // can't fold a shoulder over the spine (shoving the shoulder alone
        // could, turning the body inside out), and turning where each joint
        // was by the same amount keeps from adding speed: in this sim a move IS
        // a speed, and a limit pushing speed in kept a held pet cartwheeling.
        const phi = wrap(d - Math.atan2(Math.sin(a - base), Math.cos(a - base)));
        const c = Math.cos(phi), si = Math.sin(phi);
        const ox = piv.x, oy = piv.y;
        const turn = (q, kx, ky) => {
          const dx = q[kx] - ox, dy = q[ky] - oy;
          q[kx] = ox + dx * c - dy * si;
          q[ky] = oy + dx * si + dy * c;
        };
        for (const n of ALL) {
          if (n === L.tip) continue;
          const q = this.p[n];
          turn(q, 'x', 'y'); turn(q, 'px', 'py');
        }
      } else {
        // While held, and on the last pass for the arms, the same for a limb
        // pushed back inside its range: that pass pushed a hand lying on the
        // floor along by a few pixels every step, which slid the whole body
        // away across the floor. (Except
        // the head resting on the floor: there the floor and the neck limit take
        // turns moving it, and carrying the speed along rocked the body). Not
        // while standing up, or the limits hold the pet a few degrees off upright.
        const nx = piv.x + Math.cos(a) * len, ny = piv.y + Math.sin(a) * len;
        const headDown = L.tip === 'Hd' && tip.y >= this.floorY - this.rest.Hd.r - 1;
        if ((this.held || last) && !headDown) { tip.px += nx - tip.x; tip.py += ny - tip.y; }
        tip.x = nx; tip.y = ny;
      }
    }

    clampSoft() {
      for (const n of SOFT) {
        const j = this.p[n], t = this.softTarget(n), r = this.rest[n];
        let dx = j.x - t.x, dy = j.y - t.y;
        // Measure the stray in the body's own frame: across it (x) and along it (y).
        const th = this.frameAngle(CFG.soft[n].anchor);
        const c = Math.cos(th), s = Math.sin(th);
        let lx = dx * c + dy * s, ly = -dx * s + dy * c;
        lx = Math.max(-r.maxX, Math.min(r.maxX, lx));
        const d = Math.hypot(lx, ly);
        if (d > r.max) { lx *= r.max / d; ly *= r.max / d; }
        dx = lx * c - ly * s; dy = lx * s + ly * c;
        j.x = t.x + dx; j.y = t.y + dy;
      }
    }

    floor() {
      // While the cursor holds the pet it just hangs, over the taskbar if need
      // be. Dragged along the floor, the floor's grip rolled the body round the
      // held point like a wheel, so it spun the whole time it was carried.
      if (this.held) return;
      for (const n of ALL) {
        const j = this.p[n];
        const lim = this.floorY - this.rest[n].r;
        if (j.y > lim) {
          // Deep below the floor (let go of while hanging over the taskbar):
          // lift it out without turning the lift into an upward throw.
          if (j.y - lim > FLOOR_SINK) j.py -= j.y - lim;
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
        else {
          // Whole pixels, so two pieces cut along the same line meet without a seam.
          const x0 = Math.round(r.x0 * cs), y0 = Math.round(r.y0 * cs);
          ctx.rect(x0, y0, Math.round(r.x1 * cs) - x0, Math.round(r.y1 * cs) - y0);
        }
        ctx.fill();
      };

      // The skin colour of a picture: its most common light colour.
      const skinOf = (ctx) => {
        const all = ctx.getImageData(0, 0, CW, CH).data;
        const count = new Map();
        for (let i = 0; i < all.length; i += 16) {
          if (all[i + 3] < 250 || all[i] + all[i + 1] + all[i + 2] < 450) continue;
          const key = (all[i] >> 3) << 10 | (all[i + 1] >> 3) << 5 | (all[i + 2] >> 3);
          count.set(key, (count.get(key) || 0) + 1);
        }
        let best = -1, bestN = 0;
        for (const [k2, n] of count) if (n > bestN) { bestN = n; best = k2; }
        if (best < 0) return null;
        return [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4];
      };

      // Paint a limb's outline over in its own skin colour inside a box.
      const unline = (ctx, r) => {
        const skin = skinOf(ctx);
        if (!skin) return;
        const [sr, sg, sb] = skin;
        const x0 = Math.max(0, Math.floor(r.x0 * cs)), y0 = Math.max(0, Math.floor(r.y0 * cs));
        const x1 = Math.min(CW, Math.ceil(r.x1 * cs)), y1 = Math.min(CH, Math.ceil(r.y1 * cs));
        if (x1 <= x0 || y1 <= y0) return;
        const im = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const dark = 1 - Math.min(1, (d[i] + d[i + 1] + d[i + 2]) / (sr + sg + sb));
          if (dark <= 0.02) continue;
          d[i] = sr; d[i + 1] = sg; d[i + 2] = sb;
        }
        ctx.putImageData(im, x0, y0);
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
          const c0 = part.carry, cx0 = Math.round(c0.x0 * cs), cy0 = Math.round(c0.y0 * cs);
          art.x.rect(cx0, cy0, Math.round(c0.x1 * cs) - cx0, Math.round(c0.y1 * cs) - cy0);
          art.x.clip();
          art.x.drawImage(bodyImg, 0, 0, CW, CH);
          art.x.restore();
        };
        if (part.carry && part.carryBelow && bodyImg) putCarry();
        art.x.drawImage(img, 0, 0, CW, CH);
        if (part.unline) unline(art.x, part.unline);
        if (part.rest) {
          const skin = skinOf(art.x);
          if (skin) this.skin = `rgb(${skin[0]},${skin[1]},${skin[2]})`;
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
      const placed = {};                   // where each part was drawn, for the shoulder lines
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
          if (part.drop) {
            // The legs sit a little lower than drawn in the part files.
            const d = CFG.LEG_DROP * this.k;
            ax += -Math.sin(th) * d; ay += Math.cos(th) * d;
          }
          if (part.lift) {
            // Raising the arm lifts the shoulder: up the body, and a little inward.
            const L = CFG.shoulderLift;
            const raise = part.lift * wrap(this.ang(part.pivot, part.child) - (this.restAng(part.pivot, part.child) + th)) / DEG;
            const f = Math.max(0, Math.min(1.2, (raise - L.from) / (L.full - L.from)));
            const up = f * L.up * this.k, inward = f * L.in * this.k * part.lift;
            ax += Math.sin(th) * up + Math.cos(th) * inward;
            ay += -Math.cos(th) * up + Math.sin(th) * inward;
          }
        }
        ctx.save();
        ctx.translate(ax - originX, ay - originY);
        ctx.rotate(ang);
        ctx.drawImage(part.canvas, -part.ox * inv, -part.oy * inv, part.canvas.width * inv, part.canvas.height * inv);
        ctx.restore();
        placed[part.id] = { x: ax, y: ay, ang, pivot: part.pivot };
        if (part.id === 'body') this.drawShoulders(ctx, originX, originY, th, placed, 'armpits');
      }
      // The shoulder lines go on last: the head picture's neck covers the top of
      // the shoulders, and drawn under it the lines vanished, leaving the arms
      // looking stuck straight into the chest.
      this.drawShoulders(ctx, originX, originY, th, placed, 'shoulders');
    }

    // Redraw each shoulder line from the neck (on the body) to the arm, wherever
    // the arm has gone. `which` is 'armpits' (drawn over the body, under the
    // chest) or 'shoulders' (drawn over everything, see draw()).
    drawShoulders(ctx, originX, originY, th, placed, which) {
      const N = CFG.particles.N, n = this.p.N, k = this.k;
      const onBody = q => {
        const dx = (q[0] - N.x) * k, dy = (q[1] - N.y) * k;
        return [n.x + dx * Math.cos(th) - dy * Math.sin(th), n.y + dx * Math.sin(th) + dy * Math.cos(th)];
      };
      // Armpits first, so the shoulder line is drawn over their top.
      for (const L of which === 'armpits' ? CFG.armpitLines || [] : []) {
        const t = placed[L.part];
        if (!t) continue;
        const P = CFG.particles[t.pivot];
        const tip = this.p[CFG.parts.find(p => p.id === L.part).child];
        const raise = L.sign * wrap(Math.atan2(tip.y - this.p[t.pivot].y, tip.x - this.p[t.pivot].x)
          - (this.restAng(t.pivot, CFG.parts.find(p => p.id === L.part).child) + th)) / DEG;
        const alpha = Math.max(0, Math.min(1, (raise - 3) / 9));
        if (alpha <= 0) continue;
        const onArm = q => {
          const dx = (q[0] - P.x) * k, dy = (q[1] - P.y) * k;
          return [t.x + dx * Math.cos(t.ang) - dy * Math.sin(t.ang), t.y + dx * Math.sin(t.ang) + dy * Math.cos(t.ang)];
        };
        const a = onBody(L.side), b = onArm(L.arm), pv = onArm([P.x, P.y]), inn = onBody(L.inner);
        const c1 = onBody(L.ctrl), c2 = onArm(L.ctrl);
        const c = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
        const X = q => q[0] - originX, Y = q => q[1] - originY;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Skin over the gap...
        ctx.fillStyle = this.skin || '#fde2cf';
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.quadraticCurveTo(X(c), Y(c), X(b), Y(b));
        ctx.lineTo(X(pv), Y(pv));
        ctx.lineTo(X(inn), Y(inn));
        ctx.closePath();
        ctx.fill();
        // ...and the outline along its edge.
        ctx.strokeStyle = '#000';
        ctx.lineWidth = L.w * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.quadraticCurveTo(X(c), Y(c), X(b), Y(b));
        ctx.stroke();
        ctx.restore();
      }

      for (const L of which === 'shoulders' ? CFG.shoulderLines || [] : []) {
        const t = placed[L.part];
        if (!t) continue;
        const P = CFG.particles[t.pivot];
        const onArm = q => {
          const dx = (q[0] - P.x) * k, dy = (q[1] - P.y) * k;
          return [t.x + dx * Math.cos(t.ang) - dy * Math.sin(t.ang), t.y + dx * Math.sin(t.ang) + dy * Math.cos(t.ang)];
        };
        const a = onBody(L.neck), b = onArm(L.arm);
        // A raised arm lifts its shoulder up to the neck, and the line shrinks
        // toward a dot; fade it out as it gets that short.
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / k;
        const alpha = Math.max(0, Math.min(1, (len - 10) / 12));
        if (alpha <= 0) continue;
        const c1 = onBody(L.ctrl), c2 = onArm(L.ctrl);
        const c = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = L.w * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a[0] - originX, a[1] - originY);
        ctx.quadraticCurveTo(c[0] - originX, c[1] - originY, b[0] - originX, b[1] - originY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const api = { Ragdoll, STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetRagdoll = api;
})(typeof window !== 'undefined' ? window : globalThis);
