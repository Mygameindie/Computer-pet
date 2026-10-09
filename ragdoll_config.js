// ===========================================================
// 🦴 ragdoll_config.js — the skeleton the pet is built on
// ===========================================================
// Everything here is in the pixels of the 851 × 1134 canvas the part PNGs in
// images/parts/ are drawn on, measured from the standing pose. If you redraw a
// part, only the joints near it ever need to move.
//
// The pet is drawn from separate part files (see `parts` below). A character
// uses them if all the REQUIRED ones exist, with `_2` added for character 2
// (head_2.png ...); a character without a full set just keeps its normal
// sprite. Optional parts (back hair, chest, wings, tail) are used when present.
// ===========================================================

(function (root) {
  const SRC_W = 851;
  const SRC_H = 1134;
  // The legs are drawn this many source px lower than in the part files (the whole
  // leg, hips included, so it still turns about the same spot on the leg).
  const LEG_DROP = 20;
  const SOLE_Y = 1085 + LEG_DROP;   // lowest pixel of the feet in the standing pose

  // Joints. r = distance from the joint to the floor when lying on it,
  // k = how hard the joint is pulled back to the standing pose (0..1),
  // m = how heavy it is (a heavy torso drags light hands around, not the other
  // way round), wake = when it joins in while getting up (0 first .. 1 last):
  // feet plant first, then the hips push up, the chest, the head, the arms last.
  const particles = {
    N:    { x: 425, y: 608,  r: 30,  k: 0.50, m: 2.5, wake: 0.30 },    // neck
    P:    { x: 425, y: 858,  r: 40,  k: 0.55, m: 3.0, wake: 0.12 },    // pelvis
    Hd:   { x: 425, y: 483,  r: 105, k: 0.30, m: 2.0, wake: 0.45 },    // head centre
    SL:   { x: 370, y: 630,  r: 25,  k: 0.50, m: 1.5, wake: 0.30 },    // shoulders (where the arm meets the body, not at the neck)
    SR:   { x: 480, y: 630,  r: 25,  k: 0.50, m: 1.5, wake: 0.30 },
    HipL: { x: 390, y: 866,  r: 25,  k: 0.55, m: 2.0, wake: 0.12 },    // hips
    HipR: { x: 460, y: 866,  r: 25,  k: 0.55, m: 2.0, wake: 0.12 },
    HL:   { x: 150, y: 775,  r: 40,  k: 0.16, m: 0.6, wake: 0.55 },    // hands
    HR:   { x: 700, y: 775,  r: 40,  k: 0.16, m: 0.6, wake: 0.55 },
    FL:   { x: 375, y: 1060, r: SOLE_Y - 1060, k: 0.65, m: 1.0, wake: 0 },   // feet
    FR:   { x: 475, y: 1060, r: SOLE_Y - 1060, k: 0.65, m: 1.0, wake: 0 },
  };

  // Soft joints: not part of the skeleton but pulled toward a spot on it, so
  // they lag, overshoot and settle. `anchor` is the frame they hang from.
  // k = spring strength per step, max = furthest they can stray (source px).
  // maxX (optional) limits sideways strays across the body (so the chest can't slide
  // off the torso), gravity scales how much they sag when the pet is limp.
  const soft = {
    CL: { x: 381, y: 676, r: 15, m: 0.4, k: 0.12, anchor: 'torso', max: 26, maxX: 7, gravity: 0.35 },    // chest
    CR: { x: 469, y: 676, r: 15, m: 0.4, k: 0.12, anchor: 'torso', max: 26, maxX: 7, gravity: 0.35 },
    Hr: { x: 425, y: 950, r: 20, m: 0.8, k: 0.09, anchor: 'head',  max: 400 },   // end of the back hair
    Tt: { x: 425, y: 1015, r: 8, m: 0.5, k: 0.07, anchor: 'torso', max: 400 },  // tip of the tail
  };

  // Bones that never change length. The torso entries make the neck, shoulders,
  // pelvis and hips one rigid frame.
  const rigid = [
    ['N', 'P'], ['N', 'SL'], ['N', 'SR'], ['P', 'SL'], ['P', 'SR'], ['SL', 'SR'],
    ['N', 'HipL'], ['N', 'HipR'], ['P', 'HipL'], ['P', 'HipR'], ['HipL', 'HipR'],
    ['N', 'Hd'],
    ['SL', 'HL'], ['SR', 'HR'], ['HipL', 'FL'], ['HipR', 'FR'],
    ['N', 'Hr'],
    ['P', 'Tt'],
  ];

  // How far a limb may turn from its standing angle, in degrees, relative to
  // the torso. Positive is clockwise on screen. Legs can't cross, and the arm
  // ends are hidden under the body only for moderate turns, so these stay modest.
  // `heldLo` / `heldHi` replace `lo` / `hi` while the pet is carried by that
  // hand: the arm may be raised further (or it couldn't hang from it), but it
  // may not be lowered any further, or it would swing into the body.
  const limits = [
    { pivot: 'SL',   tip: 'HL', lo: -40, hi: 90, heldHi: 115, frame: 'torso' },
    { pivot: 'SR',   tip: 'HR', lo: -90, hi: 40, heldLo: -115, frame: 'torso' },
    { pivot: 'HipL', tip: 'FL', lo: -12, hi: 50, frame: 'torso' },
    { pivot: 'HipR', tip: 'FR', lo: -50, hi: 12, frame: 'torso' },
    { pivot: 'N',    tip: 'Hd', lo: -30, hi: 30, heldLo: -30, heldHi: 30, frame: 'torso' },
    { pivot: 'N',    tip: 'Hr', lo: -35, hi: 35, frame: 'head' },
    { pivot: 'P',    tip: 'Tt', lo: -50, hi: 50, frame: 'torso' },
  ];

  // Parts, back to front. `file` is images/parts/<file>.png. `pivot` is the joint
  // the part turns about and `child` the joint that sets its angle. `offset`
  // makes a part also follow a soft joint (the chest). `region` is the part of
  // the canvas whose clothes belong to this part, so a sleeve moves with the arm.
  // `unline`: a box (source px) on a limb's own picture where its outline is
  // painted over in skin colour: the end of the arm or leg that sits hidden under
  // the body. When the limb swings and that end peeks out, it shows as skin
  // instead of a black ring, so the joint doesn't show.
  // `carry`: pieces of the BODY picture that travel with a limb instead of
  // staying on the torso — the rounded skin lumps at the shoulders and hips that
  // hide the end of the arm or leg. Staying behind they'd be left as outline-less
  // blobs when the limb swings away; carried, they stay joined to it.
  const parts = [
    // Back items, furthest back first: hair, then wings, then tail.
    { id: 'back_hair',  file: 'back_hair',  optional: true, pivot: 'N', child: 'Hr' },
    { id: 'back_wings', file: 'back_wings', optional: true, pivot: 'N', child: 'P' },
    { id: 'back_tail',  file: 'back_tail',  optional: true, pivot: 'P', child: 'Tt' },
    { id: 'leg_L', file: 'leg_L', drop: true, unline: { x0: 340, y0: 790, x1: 425, y1: 846 }, carry: { t: 'rect', x0: 340, y0: 869, x1: 425, y1: 900 }, pivot: 'HipL', child: 'FL', region: { t: 'rect', x0: 0,   y0: 868, x1: 425, y1: SRC_H } },
    { id: 'leg_R', file: 'leg_R', drop: true, unline: { x0: 425, y0: 790, x1: 510, y1: 846 }, carry: { t: 'rect', x0: 425, y0: 869, x1: 510, y1: 900 }, pivot: 'HipR', child: 'FR', region: { t: 'rect', x0: 425, y0: 868, x1: SRC_W, y1: SRC_H } },
    { id: 'arm_L', file: 'arm_L', lift: 1, unline: { x0: 352, y0: 590, x1: 410, y1: 690 }, carry: { t: 'rect', x0: 340, y0: 590, x1: 367, y1: 662 }, pivot: 'SL', child: 'HL', region: { t: 'rect', x0: 0,   y0: 606, x1: 346,   y1: 846 } },
    { id: 'arm_R', file: 'arm_R', lift: -1, unline: { x0: 440, y0: 590, x1: 498, y1: 690 }, carry: { t: 'rect', x0: 483, y0: 590, x1: 510, y1: 662 }, pivot: 'SR', child: 'HR', region: { t: 'rect', x0: 505, y0: 606, x1: SRC_W, y1: 846 } },
    { id: 'body',  file: 'body',  pivot: 'N', child: 'P', rest: true },
    { id: 'chest_L', file: 'chest_L', optional: true, pivot: 'N', child: 'P', offset: 'CL', region: { t: 'ellipse', cx: 381, cy: 676, rx: 54, ry: 56 } },
    { id: 'chest_R', file: 'chest_R', optional: true, pivot: 'N', child: 'P', offset: 'CR', region: { t: 'ellipse', cx: 469, cy: 676, rx: 54, ry: 56 } },
    { id: 'head',  file: 'head',  carry: { t: 'rect', x0: 370, y0: 594, x1: 480, y1: 614 }, carryBelow: true, pivot: 'N', child: 'Hd', region: { t: 'rect', x0: 0, y0: 0, x1: SRC_W, y1: 606 } },
  ];

  // The shoulder line: from the base of the neck (on the body) over the top of the
  // shoulder to the top edge of the arm. In the art that line is half body, half
  // arm, so once the arm turns the two halves part; this draws it again every
  // frame, bending to wherever the arm is. `ctrl` shapes the curve at rest (it
  // moves half with the body, half with the arm). Source px.
  // The armpit line: when an arm is raised, a gap opens between the underside of
  // the arm and the side of the body. This fills it with skin and draws the
  // outline from the body's side line (`side`) round to the arm's underside
  // (`arm`). `inner` is a point inside the body that closes the filled area.
  // Fades in over the first few degrees of raise; hidden when the arm is down.
  const armpitLines = [
    { part: 'arm_L', sign: 1,  side: [373, 664], ctrl: [369, 654], arm: [353, 668], inner: [392, 640], w: 7.5 },
    { part: 'arm_R', sign: -1, side: [477, 664], ctrl: [481, 654], arm: [497, 668], inner: [458, 640], w: 7.5 },
  ];

  const shoulderLines = [
    { part: 'arm_L', neck: [380, 605], ctrl: [352, 606], arm: [326, 627], w: 6.5 },
    { part: 'arm_R', neck: [470, 605], ctrl: [498, 606], arm: [524, 627], w: 6.5 },
  ];

  // A raised arm lifts its shoulder: the whole arm (with the shoulder lump it
  // carries) is drawn up and a little toward the neck, by up to `up` / `in` source
  // px, starting once the arm is 10 degrees above standing. Only drawn that way,
  // so it costs nothing in the physics.
  const shoulderLift = { up: 16, in: 5, from: 10, full: 90 };

  const config = { shoulderLift, SRC_W, SRC_H, SOLE_Y, particles, soft, rigid, limits, shoulderLines, armpitLines, parts };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  root.RAGDOLL_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
