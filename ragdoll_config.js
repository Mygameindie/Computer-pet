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
  const SOLE_Y = 1085;          // lowest pixel of the feet in the standing pose

  // Joints. r = distance from the joint to the floor when lying on it,
  // k = how hard the joint is pulled back to the standing pose (0..1).
  const particles = {
    N:    { x: 425, y: 608,  r: 30,  k: 0.50 },    // neck
    P:    { x: 425, y: 858,  r: 40,  k: 0.55 },    // pelvis
    Hd:   { x: 425, y: 483,  r: 105, k: 0.30 },    // head centre
    SL:   { x: 385, y: 634,  r: 25,  k: 0.50 },    // shoulders
    SR:   { x: 465, y: 634,  r: 25,  k: 0.50 },
    HipL: { x: 398, y: 848,  r: 25,  k: 0.55 },    // hips
    HipR: { x: 452, y: 848,  r: 25,  k: 0.55 },
    HL:   { x: 150, y: 775,  r: 40,  k: 0.16 },    // hands
    HR:   { x: 700, y: 775,  r: 40,  k: 0.16 },
    FL:   { x: 375, y: 1060, r: SOLE_Y - 1060, k: 0.65 },   // feet
    FR:   { x: 475, y: 1060, r: SOLE_Y - 1060, k: 0.65 },
  };

  // Soft joints: not part of the skeleton but pulled toward a spot on it, so
  // they lag, overshoot and settle. `anchor` is the frame they hang from.
  // k = spring strength per step, max = furthest they can stray (source px).
  const soft = {
    CL: { x: 381, y: 676, r: 15, k: 0.12, anchor: 'torso', max: 26 },    // chest
    CR: { x: 469, y: 676, r: 15, k: 0.12, anchor: 'torso', max: 26 },
    Hr: { x: 425, y: 950, r: 20, k: 0.09, anchor: 'head',  max: 400 },   // end of the back hair
  };

  // Bones that never change length. The torso entries make the neck, shoulders,
  // pelvis and hips one rigid frame.
  const rigid = [
    ['N', 'P'], ['N', 'SL'], ['N', 'SR'], ['P', 'SL'], ['P', 'SR'], ['SL', 'SR'],
    ['N', 'HipL'], ['N', 'HipR'], ['P', 'HipL'], ['P', 'HipR'], ['HipL', 'HipR'],
    ['N', 'Hd'],
    ['SL', 'HL'], ['SR', 'HR'], ['HipL', 'FL'], ['HipR', 'FR'],
    ['N', 'Hr'],
  ];

  // How far a limb may turn from its standing angle, in degrees, relative to
  // the torso. Positive is clockwise on screen. Legs can't cross, and the arm
  // ends are hidden under the body only for moderate turns, so these stay modest.
  const limits = [
    { pivot: 'SL',   tip: 'HL', lo: -50, hi: 50, frame: 'torso' },
    { pivot: 'SR',   tip: 'HR', lo: -50, hi: 50, frame: 'torso' },
    { pivot: 'HipL', tip: 'FL', lo: -12, hi: 50, frame: 'torso' },
    { pivot: 'HipR', tip: 'FR', lo: -50, hi: 12, frame: 'torso' },
    { pivot: 'N',    tip: 'Hd', lo: -55, hi: 55, frame: 'torso' },
    { pivot: 'N',    tip: 'Hr', lo: -35, hi: 35, frame: 'head' },
  ];

  // Parts, back to front. `file` is images/parts/<file>.png. `pivot` is the joint
  // the part turns about and `child` the joint that sets its angle. `offset`
  // makes a part also follow a soft joint (the chest). `region` is the part of
  // the canvas whose clothes belong to this part, so a sleeve moves with the arm.
  const parts = [
    { id: 'back_wings', file: 'back_wings', optional: true, pivot: 'N', child: 'P' },
    { id: 'back_tail',  file: 'back_tail',  optional: true, pivot: 'P', child: 'N' },
    { id: 'back_hair',  file: 'back_hair',  optional: true, pivot: 'N', child: 'Hr' },
    { id: 'leg_L', file: 'leg_L', pivot: 'HipL', child: 'FL', region: { t: 'rect', x0: 0,   y0: 868, x1: 425, y1: SRC_H } },
    { id: 'leg_R', file: 'leg_R', pivot: 'HipR', child: 'FR', region: { t: 'rect', x0: 425, y0: 868, x1: SRC_W, y1: SRC_H } },
    { id: 'arm_L', file: 'arm_L', pivot: 'SL', child: 'HL', region: { t: 'rect', x0: 0,   y0: 606, x1: 346,   y1: 846 } },
    { id: 'arm_R', file: 'arm_R', pivot: 'SR', child: 'HR', region: { t: 'rect', x0: 505, y0: 606, x1: SRC_W, y1: 846 } },
    { id: 'body',  file: 'body',  pivot: 'N', child: 'P', rest: true },
    { id: 'chest_L', file: 'chest_L', optional: true, pivot: 'N', child: 'P', offset: 'CL', region: { t: 'ellipse', cx: 381, cy: 676, rx: 54, ry: 56 } },
    { id: 'chest_R', file: 'chest_R', optional: true, pivot: 'N', child: 'P', offset: 'CR', region: { t: 'ellipse', cx: 469, cy: 676, rx: 54, ry: 56 } },
    { id: 'head',  file: 'head',  pivot: 'N', child: 'Hd', region: { t: 'rect', x0: 0, y0: 0, x1: SRC_W, y1: 606 } },
  ];

  const config = { SRC_W, SRC_H, SOLE_Y, particles, soft, rigid, limits, parts };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  root.RAGDOLL_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
