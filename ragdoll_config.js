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
    SL:   { x: 364, y: 642,  r: 25,  k: 0.50 },    // shoulders (where the arm meets the body, not at the neck)
    SR:   { x: 486, y: 642,  r: 25,  k: 0.50 },
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
  // maxX (optional) limits sideways strays across the body (so the chest can't slide
  // off the torso), gravity scales how much they sag when the pet is limp.
  const soft = {
    CL: { x: 381, y: 676, r: 15, k: 0.12, anchor: 'torso', max: 26, maxX: 7, gravity: 0.35 },    // chest
    CR: { x: 469, y: 676, r: 15, k: 0.12, anchor: 'torso', max: 26, maxX: 7, gravity: 0.35 },
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
  // `held` is how far an arm may be raised or lowered while the pet is being
  // carried by that hand, which has to be more or it couldn't hang from it.
  const limits = [
    { pivot: 'SL',   tip: 'HL', lo: -50, hi: 50, held: 105, frame: 'torso' },
    { pivot: 'SR',   tip: 'HR', lo: -50, hi: 50, held: 105, frame: 'torso' },
    { pivot: 'HipL', tip: 'FL', lo: -12, hi: 50, frame: 'torso' },
    { pivot: 'HipR', tip: 'FR', lo: -50, hi: 12, frame: 'torso' },
    { pivot: 'N',    tip: 'Hd', lo: -35, hi: 35, frame: 'torso' },
    { pivot: 'N',    tip: 'Hr', lo: -35, hi: 35, frame: 'head' },
  ];

  // Parts, back to front. `file` is images/parts/<file>.png. `pivot` is the joint
  // the part turns about and `child` the joint that sets its angle. `offset`
  // makes a part also follow a soft joint (the chest). `region` is the part of
  // the canvas whose clothes belong to this part, so a sleeve moves with the arm.
  // `carry`: pieces of the BODY picture that travel with a limb instead of
  // staying on the torso — the rounded skin lumps at the shoulders and hips that
  // hide the end of the arm or leg. Staying behind they'd be left as outline-less
  // blobs when the limb swings away; carried, they stay joined to it.
  const parts = [
    { id: 'back_wings', file: 'back_wings', optional: true, pivot: 'N', child: 'P' },
    { id: 'back_tail',  file: 'back_tail',  optional: true, pivot: 'P', child: 'N' },
    { id: 'back_hair',  file: 'back_hair',  optional: true, pivot: 'N', child: 'Hr' },
    { id: 'leg_L', file: 'leg_L', spread: 1, carry: { t: 'rect', x0: 340, y0: 869, x1: 425, y1: 900 }, pivot: 'HipL', child: 'FL', region: { t: 'rect', x0: 0,   y0: 868, x1: 425, y1: SRC_H } },
    { id: 'leg_R', file: 'leg_R', spread: -1, carry: { t: 'rect', x0: 425, y0: 869, x1: 510, y1: 900 }, pivot: 'HipR', child: 'FR', region: { t: 'rect', x0: 425, y0: 868, x1: SRC_W, y1: SRC_H } },
    { id: 'arm_L', file: 'arm_L', lift: 1, carry: { t: 'rect', x0: 340, y0: 590, x1: 367, y1: 662 }, pivot: 'SL', child: 'HL', region: { t: 'rect', x0: 0,   y0: 606, x1: 346,   y1: 846 } },
    { id: 'arm_R', file: 'arm_R', lift: -1, carry: { t: 'rect', x0: 483, y0: 590, x1: 510, y1: 662 }, pivot: 'SR', child: 'HR', region: { t: 'rect', x0: 505, y0: 606, x1: SRC_W, y1: 846 } },
    { id: 'body',  file: 'body',  pivot: 'N', child: 'P', rest: true },
    { id: 'chest_L', file: 'chest_L', optional: true, pivot: 'N', child: 'P', offset: 'CL', region: { t: 'ellipse', cx: 381, cy: 676, rx: 54, ry: 56 } },
    { id: 'chest_R', file: 'chest_R', optional: true, pivot: 'N', child: 'P', offset: 'CR', region: { t: 'ellipse', cx: 469, cy: 676, rx: 54, ry: 56 } },
    { id: 'head',  file: 'head',  carry: { t: 'rect', x0: 370, y0: 594, x1: 480, y1: 614 }, carryBelow: true, pivot: 'N', child: 'Hd', region: { t: 'rect', x0: 0, y0: 0, x1: SRC_W, y1: 606 } },
  ];

  // Outline strokes added to the torso only while an arm has swung away from it.
  // At rest the arm's own shoulder covers that edge of the body; once the arm
  // moves off, the torso would be left with a raw skin edge and no outline, so a
  // line is faded in along it (from `from` to `to`, in source px) as the arm
  // turns from 20 to 40 degrees away from standing.
  // `limbs` are the arms/legs whose swing fades the line in (the biggest one
  // counts; a third value of 1 or -1 counts only the swing in that direction); `t0`/`t1` are the degrees where it starts and is fully shown.
  const edges = [
    { limbs: [['SL', 'HL']], from: [372, 596], to: [372, 647], w: 9.5, t0: 20, t1: 40 },
    { limbs: [['SR', 'HR']], from: [478, 596], to: [478, 647], w: 9.5, t0: 20, t1: 40 },
    // the bottom of the pelvis, once either leg has swung away from standing
    { limbs: [['HipL', 'FL', 1], ['HipR', 'FR', -1]], from: [372, 862], ctrl: [425, 884], to: [478, 862], w: 9.5, t0: 8, t1: 12 },
  ];

  // A raised arm lifts its shoulder: the whole arm (with the shoulder lump it
  // carries) is drawn up and a little toward the neck, by up to `up` / `in` source
  // px, starting once the arm is 10 degrees above standing. Only drawn that way,
  // so it costs nothing in the physics.
  const shoulderLift = { up: 16, in: 5, from: 10, full: 90 };

  // A leg that swings out slides toward the body and up a little, so its top stays
  // tucked under the pelvis instead of pulling away from it.
  const hipSlide = { in: 9, up: 4, from: 8, full: 45 };

  const config = { hipSlide, shoulderLift, SRC_W, SRC_H, SOLE_Y, particles, soft, rigid, limits, edges, parts };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  root.RAGDOLL_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
