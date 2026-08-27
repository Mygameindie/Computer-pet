// ===========================================================
// 🦴 pet_rig_config.js — the pet's skeleton
// ===========================================================
//
//  Every number here is in SOURCE-IMAGE pixels, i.e. coordinates inside
//  images/base.png (851 x 1134). The rig scales them to whatever size the pet
//  is drawn at, so changing the pet's drawn height changes nothing here.
//
//  ── THE ONE RULE ──────────────────────────────────────────────────────────
//  The joints must sit where the joints ARE in your artwork. That is the whole
//  contract. Draw the pet with its arms straight out and the shoulders, elbows
//  and hands go on that line; draw it with its arms down and they go there
//  instead. The rig does not care which, and neither pose is more "correct" —
//  see restPose below.
//
//  Nothing else has to be re-measured when you change the art, because the rig
//  works out where each limb's pixels are for itself: a pixel belongs to
//  whichever bone it is nearest to. That is how the cuts used to be measured by
//  hand, so it produces the same result, but it now follows the skeleton
//  automatically instead of being a list of polygons that goes stale.
//
//  TO RE-TUNE: run the app and press Ctrl+Shift+B. The overlay draws every
//  joint, bone, derived cut and back-part chain on top of the pet, so you can
//  see exactly what you are changing.
// ===========================================================

window.PET_RIG = {

  // Turn the whole ragdoll off and every caller falls back to drawing the flat
  // sprite exactly as it did before the rig existed. Nothing else changes.
  enabled: true,

  src: { w: 851, h: 1134 },

  // ---- Which pose the artwork is drawn in ---------------------------------
  // 'natural' — arms hanging out and down, the pose base.png ships in.
  // 'tpose'   — arms straight out horizontal, legs straight down.
  //
  // This is NOT a pose the rig puts the pet into: it is you telling the rig
  // which pose the pet is ALREADY drawn in, so the skeleton lands on the
  // artwork. Swapping base.png for T-posed art means flipping this line.
  // Anything in between (an A-pose, one arm raised) is a third entry here with
  // its own joints — copy a block and drag the numbers onto your art with the
  // Ctrl+Shift+B overlay open.
  restPose: 'natural',

  poses: {

    // ---------------------------------------------------------------------
    // NATURAL — measured off the base.png that ships with this app.
    // Arms hang out and down at about 23° below horizontal; legs are straight.
    // ---------------------------------------------------------------------
    natural: {
      joints: {
        headTop:    { x:  425, y:  392 },
        neck:       { x:  425, y:  606 },
        chest:      { x:  425, y:  648 },
        pelvis:     { x:  425, y:  862 },
        shoulderL:  { x:  362, y:  676 },
        shoulderR:  { x:  488, y:  676 },
        elbowL:     { x:  273, y:  714 },
        elbowR:     { x:  577, y:  714 },
        handL:      { x:  186, y:  752 },
        handR:      { x:  664, y:  752 },
        hipL:       { x:  397, y:  866 },
        hipR:       { x:  453, y:  866 },
        kneeL:      { x:  382, y:  953 },
        kneeR:      { x:  468, y:  953 },
        footL:      { x:  360, y: 1040 },
        footR:      { x:  490, y: 1040 },
      },

      // [min, max] degrees each bone may turn RELATIVE TO ITS REST ANGLE, and
      // therefore relative to the pose. Nothing here does collision, so a
      // joint's own range is the only thing keeping an arm out of the chest
      // and the legs from crossing over.
      limits: {
        head:  [ -40,  40],
        armLU: [ -85,  85], armLL: [-10, 100],
        armRU: [ -85,  85], armRL: [-100, 10],
        legLU: [ -34,  34], legLL: [-110,  6],
        legRU: [ -34,  34], legRL: [  -6, 110],
      },

      // How far past its own length the lower bone of a limb may be asked to
      // span — the room the body has to lean into a pull. It has to be small
      // here, because this pet stands with every limb already straight:
      // shoulder, elbow and hand are collinear at rest, and so are hip, knee
      // and foot. There is no folded joint anywhere to open up, so a demand
      // much past bone length has nothing left to answer it and the arm would
      // visibly stretch instead.
      reachSlack: 1.08,
    },

    // ---------------------------------------------------------------------
    // T-POSE — for art drawn with the arms straight out and the legs straight
    // down. Same character, same bone lengths (96.8px upper arm, 94.9px
    // forearm, 88.3px thigh, 89.7px shin), swung onto the axes.
    //
    // These are a starting point, not a measurement: nobody has drawn T-posed
    // art for this character yet. Open Ctrl+Shift+B and drag them onto yours.
    // ---------------------------------------------------------------------
    tpose: {
      joints: {
        headTop:    { x:  425, y:  392 },
        neck:       { x:  425, y:  606 },
        chest:      { x:  425, y:  648 },
        pelvis:     { x:  425, y:  862 },
        shoulderL:  { x:  362, y:  676 },
        shoulderR:  { x:  488, y:  676 },
        elbowL:     { x:  265, y:  676 },
        elbowR:     { x:  585, y:  676 },
        handL:      { x:  170, y:  676 },
        handR:      { x:  680, y:  676 },
        hipL:       { x:  397, y:  866 },
        hipR:       { x:  453, y:  866 },
        kneeL:      { x:  397, y:  954 },
        kneeR:      { x:  453, y:  954 },
        footL:      { x:  397, y: 1044 },
        footR:      { x:  453, y: 1044 },
      },

      // Measured from horizontal now, so they are not the natural pose's
      // numbers. An arm that starts level has almost a full quarter-turn of
      // drop available and very little lift before it hits the head; the legs
      // start straight, so the knees keep their range.
      limits: {
        head:  [ -40,  40],
        armLU: [ -95,  30], armLL: [-10, 100],
        armRU: [ -30,  95], armRL: [-100, 10],
        legLU: [ -34,  34], legLL: [-110,  6],
        legRU: [ -34,  34], legRL: [  -6, 110],
      },

      // Every limb is dead straight in a T-pose, so there is even less to give
      // than in the natural pose before a bone would have to stretch.
      reachSlack: 1.02,
    },
  },

  // ---- Bones ---------------------------------------------------------------
  // A bone is the stretch of artwork between two joints. It is drawn rotated
  // about joint 'a'.
  //
  //   a / b   the two joints this bone spans; it rotates about 'a'
  //   z       draw order, higher = in front
  //   grab    how close the cursor must be, in source pixels, to grab it
  //
  // There is deliberately no artwork rectangle or clip polygon here. The rig
  // derives both from the skeleton and the sprite's own alpha, by giving each
  // opaque pixel to the bone it is nearest to, so a cut can never disagree
  // with the pose. If you ever need to overrule that for one bone, add
  //   cut: { rect: [sx, sy, sw, sh], clip: [[x,y], ...] }
  // and the rig will use your polygon for that bone and keep deriving the rest.
  bones: [
    { id: 'head',  a: 'neck',      b: 'headTop', z: 160, grab: 30 },
    { id: 'torso', a: 'chest',     b: 'pelvis',  z: 100, grab: 44 },
    { id: 'armLU', a: 'shoulderL', b: 'elbowL',  z: 120, grab: 26 },
    { id: 'armLL', a: 'elbowL',    b: 'handL',   z: 130, grab: 34 },
    { id: 'armRU', a: 'shoulderR', b: 'elbowR',  z: 120, grab: 26 },
    { id: 'armRL', a: 'elbowR',    b: 'handR',   z: 130, grab: 34 },
    { id: 'legLU', a: 'hipL',      b: 'kneeL',   z:  90, grab: 24 },
    { id: 'legLL', a: 'kneeL',     b: 'footL',   z:  95, grab: 30 },
    { id: 'legRU', a: 'hipR',      b: 'kneeR',   z:  90, grab: 24 },
    { id: 'legRL', a: 'kneeR',     b: 'footR',   z:  95, grab: 30 },
  ],

  // Points the solver holds rigidly to the torso, so the chest and hips behave
  // like a ribcage and a pelvis instead of folding up like paper.
  //
  // Every point here needs THREE braces to points that are not in a straight
  // line, not two. Two distances put a point at one of two places — the right
  // one and its mirror image — and both satisfy the solver equally well, so a
  // hard enough landing can flip a joint to the wrong side and leave it stuck
  // there permanently, because from the solver's point of view nothing is
  // wrong. That is why the neck is braced to the chest as well as to both
  // shoulders, and each hip to the pelvis as well as to the chest and the
  // other hip.
  braces: [
    ['shoulderL', 'shoulderR'], ['shoulderL', 'chest'], ['shoulderR', 'chest'],
    ['shoulderL', 'pelvis'],    ['shoulderR', 'pelvis'],
    ['hipL', 'hipR'],           ['hipL', 'chest'],      ['hipR', 'chest'],
    ['hipL', 'pelvis'],         ['hipR', 'pelvis'],
    ['neck', 'shoulderL'],      ['neck', 'shoulderR'],  ['neck', 'chest'],
    ['neck', 'pelvis'],
  ],

  // ---- Back parts ----------------------------------------------------------
  // Everything that is part of the BODY but sits BEHIND it: wings, a tail, long
  // hair, a ponytail. These cannot live in base.png — they would be welded to
  // the torso, and cutting the base into limbs would tear them apart.
  //
  // TO ADD ONE: draw it on a transparent 851x1134 canvas, lined up with
  // base.png exactly as a piece of clothing would be, save it as the 'img'
  // named below, and refresh. There is no other step. A part whose PNG is
  // missing simply does not exist — every entry here is optional.
  //
  //   bone       which bone it is glued to; it inherits that bone's position
  //              and rotation, so it can never come loose
  //   anchor     the point it pivots about, in source pixels
  //   z          draw order against the body (torso is 100) and against the
  //              back-layer clothes
  //
  // Then pick ONE kind of movement:
  //
  //   segments: N   a CHAIN. The part is sliced into N strips along its length
  //                 and each strip gets its own simulated point, so it whips
  //                 when the pet is thrown and settles when it lands. This is
  //                 what a ponytail or a tail needs — a stiff plank that
  //                 rotates in one piece does not read as hair.
  //                 'stiffness' (0..1) is how hard it springs back to its rest
  //                 shape: low is loose and floaty, high is barely-there.
  //
  //   lag: 0..1     ONE piece that trails behind its bone's rotation and
  //                 springs back. Right for something stiff, like a wing, and
  //                 much cheaper. 'maxLag' caps the trail in degrees.
  //                 'flap: true' adds a slow flutter while the pet is airborne.
  //
  // These parts used to be painted into base.png and carved back out with a
  // hand-measured pixel mask. They are real files now: images/wings.png and, for
  // character 2, images/wings_2.png and images/tail_2.png. base_original.png
  // next to them is the untouched sprite they came out of, kept for reference.
  //
  // The mask path still exists in pet_rig.js and still works — add a 'mask' of
  // row runs [y, x0, x1] instead of an 'img' and the part is carved out of the
  // base art as before. Nothing here uses it any more, and an 'img' wins over a
  // mask if both are given. Prefer the file: a carved part can never recover
  // what the body was covering, and a drawn one comes out whole.
  backParts: [

    { id: 'tail', img: 'tail.png', bone: 'pelvis', anchor: { x: 370, y: 867 },
      z: 45, segments: 3, stiffness: 0.30 },

    { id: 'ponytail', img: 'ponytail.png', bone: 'head', anchor: { x: 425, y: 430 },
      z: 50, segments: 3, stiffness: 0.22 },

    { id: 'hairBack', img: 'hair_back.png', bone: 'head', anchor: { x: 425, y: 420 },
      z: 55, lag: 0.14, maxLag: 10 },

    { id: 'wings', img: 'wings.png', bone: 'torso', anchor: { x: 425, y: 648 },
      z: 40, lag: 0.22, maxLag: 16, flap: true },

  ],

  // ---- Front parts ---------------------------------------------------------
  // Same idea, but drawn OVER the body and over its clothes: a front fringe of
  // hair, the near wing of a pair, a scarf tail. Same fields, same optionality.
  frontParts: [
    { id: 'hairFront', img: 'hair_front.png', bone: 'head', anchor: { x: 425, y: 420 },
      z: 200, lag: 0.10, maxLag: 8 },
  ],

  // ---- Feel ---------------------------------------------------------------
  // pose is the spring that pulls every joint back toward its rest pose. It is
  // the single knob that decides floppy vs stiff, and the mode is picked from
  // what the pet is doing.
  tuning: {
    gravity: 2000,          // source-px/s² inside the rig (the body's own fall
                            // is the host app's job; this is only the limbs)
    damping: 0.985,         // velocity kept per step
    iterations: 12,         // constraint passes per step — more = stiffer joints
    substep: 1 / 120,       // fixed timestep

    pose: {
      idle:      0.42,      // standing: holds the pose, sways gently
      heldBody:  0.06,      // carried by the torso: limbs hang and swing
      heldLimb:  0.16,      // pulled by a hand or foot: body leans, stays up
      airborne:  0.035,     // thrown: full ragdoll
    },
    recoverMs: 700,         // how long the pose spring takes to ramp back up
    // Idle breathing, in source pixels. OFF by default on purpose: an idle pet
    // costs nothing at all — the desktop app stops its physics timer and its
    // animation frame — and a pet that sways forever is a pet that redraws
    // forever. Set amp to ~0.9 if you would rather have the life than the 0%.
    sway: { amp: 0, hz: 0.28 },
    // How far the pet squashes on a full-speed landing: 0.24 means it flattens
    // to 76% of its height and widens, then springs back.
    landSquash: 0.24,
    sleepEps: 0.05,         // below this much motion the rig stops simulating

    // Grows every derived cut outward by this many source pixels. The cuts
    // already overlap by cutOverlap below, so this is only for a garment that
    // hangs wider than the limb underneath and comes out shaved.
    clipGrow: 0,

    // How far each bone's cut is grown into its neighbours' pixels, in source
    // pixels. This is what stops a hairline gap opening along a joint when a
    // limb turns: the two sides overlap instead of meeting exactly.
    //
    // 0 reassembles the standing pet pixel-perfectly and then cracks open the
    // moment it moves. Measured on this artwork with every limb swung 25°, the
    // gap pixels along the joints go 2951 at 0, 2041 at 2, 902 at 6, 313 at 12,
    // and none of it shows at rest. 6 buys most of that for the least
    // double-drawing at the joints. Raise it if you see the pet crack open when
    // it is thrown; lower it if semi-transparent artwork darkens along a seam.
    cutOverlap: 6,

    // How much of a chain part's length the first segment covers, versus the
    // ones below it. 1 is even. Below 1 makes the root segment shorter, so the
    // whip happens nearer the tip — which is how real hair moves.
    chainTaper: 0.85,
  },
};
