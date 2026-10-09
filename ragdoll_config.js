// ===========================================================
// 🦴 ragdoll_config.js — the skeleton the ragdoll is built from
// ===========================================================
// All coordinates are in the pixels of the base sprite (851 × 1134), measured
// from the standing pose in images/base.png and images/base_2.png. If you
// redraw the base art, this is the one file to touch: move a joint, resize a
// capsule, and every outfit follows, because clothes are cut up with the same
// shapes as the body underneath them.
//
// How the sprite is cut up
//   The finished picture (body + whatever clothes are on) is sliced into parts.
//   A part is the union of its `shapes`. A pixel can belong to several parts —
//   that overlap at the joints is deliberate: it is what stops a gap opening at
//   the elbow when the arm bends. The torso is "everything nobody else claimed",
//   so wings, tails and loose clothing ride along with the body without being
//   listed anywhere.
// ===========================================================

(function (root) {
  const SRC_W = 851;
  const SRC_H = 1134;
  const SOLE_Y = 1054;           // lowest pixel of the feet in the standing pose

  // Joints. r = collision radius against the floor, k = how hard the joint is
  // pulled back toward the standing pose while the pet is "awake" (0..1).
  const particles = {
    N:     { x: 425, y: 610,  r: 30, k: 0.50 },   // neck
    P:     { x: 425, y: 858,  r: 40, k: 0.55 },   // pelvis
    Hd:    { x: 425, y: 500,  r: 105, k: 0.30 },  // head centre
    SL:    { x: 385, y: 628,  r: 25, k: 0.50 },   // shoulders
    SR:    { x: 465, y: 628,  r: 25, k: 0.50 },
    EL:    { x: 285, y: 690,  r: 27, k: 0.22 },   // elbows
    ER:    { x: 565, y: 690,  r: 27, k: 0.22 },
    HL:    { x: 186, y: 752,  r: 55, k: 0.16 },   // hands
    HR:    { x: 664, y: 752,  r: 55, k: 0.16 },
    HipL:  { x: 395, y: 872,  r: 25, k: 0.55 },   // hips
    HipR:  { x: 455, y: 872,  r: 25, k: 0.55 },
    KL:    { x: 388, y: 938,  r: 25, k: 0.40 },   // knees
    KR:    { x: 462, y: 938,  r: 25, k: 0.40 },
    FL:    { x: 368, y: 1031, r: SOLE_Y - 1031, k: 0.65 },   // feet
    FR:    { x: 482, y: 1031, r: SOLE_Y - 1031, k: 0.65 },
  };

  // Bones that never change length. Anything listed as `torso` is a rigid
  // frame, so the shoulders, hips, neck and pelvis move as one body.
  const rigid = [
    ['N', 'P'], ['N', 'SL'], ['N', 'SR'], ['P', 'SL'], ['P', 'SR'], ['SL', 'SR'],
    ['N', 'HipL'], ['N', 'HipR'], ['P', 'HipL'], ['P', 'HipR'], ['HipL', 'HipR'],
    ['N', 'Hd'],
    ['SL', 'EL'], ['EL', 'HL'], ['SR', 'ER'], ['ER', 'HR'],
    ['HipL', 'KL'], ['KL', 'FL'], ['HipR', 'KR'], ['KR', 'FR'],
  ];

  // Joint limits, as a share of the rest distance between two joints. A fully
  // straight limb is 1.0; pulling the minimum up stops an elbow or knee from
  // folding flat, and keeping the head's distance from the pelvis above ~0.8
  // is what stops it from being swung round to look at its own back.
  const ranges = [
    ['SL', 'HL', 0.40, 1.0],
    ['SR', 'HR', 0.40, 1.0],
    ['HipL', 'FL', 0.55, 1.0],
    ['HipR', 'FR', 0.55, 1.0],
    ['P', 'Hd', 0.80, 1.02],
    ['KL', 'KR', 0.80, Infinity],     // knees can't pass through each other
    ['FL', 'FR', 0.55, Infinity],
  ];

  // Parts, back to front. `pivot` is the joint the part turns about and `child`
  // the joint that gives it its angle. `keepRoot` is a circle that stays with
  // the torso as well, so a swinging limb leaves skin behind instead of a hole.
  const parts = [
    { id: 'thighL', pivot: 'HipL', child: 'KL',
      shapes: [{ t: 'cap', a: 'HipL', b: 'KL', r: 30 }], keepRoot: { c: 'HipL', r: 30 } },
    { id: 'shinL', pivot: 'KL', child: 'FL',
      shapes: [{ t: 'cap', a: 'KL', b: 'FL', r: 30 }, { t: 'circle', c: 'FL', r: 45 }] },
    { id: 'thighR', pivot: 'HipR', child: 'KR',
      shapes: [{ t: 'cap', a: 'HipR', b: 'KR', r: 30 }], keepRoot: { c: 'HipR', r: 30 } },
    { id: 'shinR', pivot: 'KR', child: 'FR',
      shapes: [{ t: 'cap', a: 'KR', b: 'FR', r: 30 }, { t: 'circle', c: 'FR', r: 45 }] },

    { id: 'torso', pivot: 'N', child: 'P', rest: true },

    { id: 'upperArmL', pivot: 'SL', child: 'EL',
      shapes: [{ t: 'cap', a: 'SL', b: 'EL', r: 31 }], keepRoot: { c: 'SL', r: 31 } },
    { id: 'foreArmL', pivot: 'EL', child: 'HL',
      shapes: [{ t: 'cap', a: 'EL', b: 'HL', r: 31 }, { t: 'circle', c: 'HL', r: 62 }] },
    { id: 'upperArmR', pivot: 'SR', child: 'ER',
      shapes: [{ t: 'cap', a: 'SR', b: 'ER', r: 31 }], keepRoot: { c: 'SR', r: 31 } },
    { id: 'foreArmR', pivot: 'ER', child: 'HR',
      shapes: [{ t: 'cap', a: 'ER', b: 'HR', r: 31 }, { t: 'circle', c: 'HR', r: 62 }] },

    // Hair, horns and ears are part of the head's silhouette, hence the box.
    { id: 'head', pivot: 'N', child: 'Hd',
      shapes: [{ t: 'rect', x0: 268, y0: 340, x1: 585, y1: 528 }, { t: 'circle', c: 'Hd', r: 113 }],
      keepRoot: { c: 'N', r: 45 } },
  ];

  const config = { SRC_W, SRC_H, SOLE_Y, particles, rigid, ranges, parts };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  root.RAGDOLL_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
