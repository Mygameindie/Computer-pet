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
//  joint, bone, derived cut, skin grid, soft-tissue patch and back-part chain on
//  top of the pet, so you can see exactly what you are changing. Or serve the
//  folder and open tools/rig_check.html, which shows the four poses that break a
//  rig side by side and will stress-test the numbers you have just changed.
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
    // NATURAL — traced off tools/skeleton.png, the bones drawn by hand over
    // the character. Arms out and down at 34° below horizontal; legs straight.
    //
    // Five lines were drawn — spine, two arms, two legs — and the seventeen
    // joints come off them like this, which is worth knowing if you redraw it:
    //
    //   neck / pelvis     the two ends of the spine line
    //   chest             on the spine, level with the shoulders (the sternum)
    //   waist             on the spine, 62% of the way down
    //   shoulder / hand   the two ends of an arm line
    //   hip / foot        the two ends of a leg line
    //   elbow / knee      halfway along, because a straight line does not say
    //                     where they are. Mark them and they will be used.
    //   headTop           not drawn — placed so the head bone runs up the
    //                     middle of the head. It is the one number here that
    //                     came off the artwork rather than off the drawing.
    //
    // The drawing came out symmetric to within a pixel: the four arm bones are
    // 91.3–91.8px and all four leg bones are 90.7px.
    // ---------------------------------------------------------------------
    natural: {
      joints: {
        headTop:    { x:  424, y:  392 },
        neck:       { x:  423, y:  602 },
        chest:      { x:  423, y:  626 },
        waist:      { x:  425, y:  762 },
        pelvis:     { x:  426, y:  860 },
        shoulderL:  { x:  372, y:  627 },
        shoulderR:  { x:  479, y:  625 },
        elbowL:     { x:  296, y:  678 },
        elbowR:     { x:  554, y:  678 },
        handL:      { x:  221, y:  730 },
        handR:      { x:  629, y:  730 },
        hipL:       { x:  394, y:  845 },
        hipR:       { x:  456, y:  845 },
        kneeL:      { x:  383, y:  935 },
        kneeR:      { x:  467, y:  935 },
        footL:      { x:  372, y: 1025 },
        footR:      { x:  478, y: 1025 },
      },

      // [min, max] degrees each bone may turn RELATIVE TO ITS REST ANGLE, and
      // therefore relative to the pose. Nothing here does collision, so a
      // joint's own range is the only thing keeping an arm out of the chest
      // and the legs from crossing over.
      // A person's ranges, not a doll's. The two that matter most are the ones
      // that only go one way: an elbow folds most of the way shut and does not
      // open backwards, and neither does a knee. The few degrees of the wrong
      // sign are real — most people's joints do hyperextend slightly, and taking
      // them to exactly zero makes a straight arm look welded.
      limits: {
        head:  [ -38,  38],
        hips:  [ -18,  18],                          // bend at the waist
        armLU: [ -92,  92], armLL: [  -8, 145],
        armRU: [ -92,  92], armRL: [-145,   8],
        legLU: [ -40,  40], legLL: [-140,   3],
        legRU: [ -40,  40], legRL: [  -3, 140],
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
    // down. Same character, same bone lengths as the drawn skeleton above
    // (91.5px upper arm, 91.3px forearm, 90.7px thigh and shin), swung onto
    // the axes.
    //
    // These are a starting point, not a measurement: nobody has drawn T-posed
    // art for this character yet. Open Ctrl+Shift+B and drag them onto yours.
    // ---------------------------------------------------------------------
    tpose: {
      joints: {
        headTop:    { x:  424, y:  392 },
        neck:       { x:  423, y:  602 },
        chest:      { x:  423, y:  626 },
        waist:      { x:  425, y:  762 },
        pelvis:     { x:  426, y:  860 },
        shoulderL:  { x:  372, y:  627 },
        shoulderR:  { x:  479, y:  625 },
        elbowL:     { x:  280, y:  627 },
        elbowR:     { x:  571, y:  625 },
        handL:      { x:  189, y:  627 },
        handR:      { x:  662, y:  625 },
        hipL:       { x:  394, y:  845 },
        hipR:       { x:  456, y:  845 },
        kneeL:      { x:  394, y:  936 },
        kneeR:      { x:  456, y:  936 },
        footL:      { x:  394, y: 1026 },
        footR:      { x:  456, y: 1026 },
      },

      // Measured from horizontal now, so they are not the natural pose's
      // numbers. An arm that starts level has almost a full quarter-turn of
      // drop available and very little lift before it hits the head; the legs
      // start straight, so the knees keep their range.
      limits: {
        head:  [ -38,  38],
        hips:  [ -18,  18],
        armLU: [ -95,  30], armLL: [  -8, 145],
        armRU: [ -30,  95], armRL: [-145,   8],
        legLU: [ -40,  40], legLL: [-140,   3],
        legRU: [ -40,  40], legRL: [  -3, 140],
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
  //   parent  overrides which bone this one's joint limits are measured
  //           against. Only needed where the answer is not "the bone that ends
  //           where this one starts" — the legs, which start at the hips.
  //
  // The spine is TWO bones. One chest-to-pelvis plank cannot bend, and a body
  // that cannot bend at the waist is the single loudest tell that something is
  // a puppet: thrown, it stays board-straight and pivots only at the hips; sat
  // on the floor it folds at nothing. 'torso' keeps its name because everything
  // that hangs off the upper body — a cape, a pair of wings — names it.
  bones: [
    { id: 'head',  a: 'neck',      b: 'headTop', z: 160, grab: 30 },
    { id: 'torso', a: 'chest',     b: 'waist',   z: 100, grab: 44 },
    { id: 'hips',  a: 'waist',     b: 'pelvis',  z: 100, grab: 40 },
    { id: 'armLU', a: 'shoulderL', b: 'elbowL',  z: 120, grab: 26 },
    { id: 'armLL', a: 'elbowL',    b: 'handL',   z: 130, grab: 34 },
    { id: 'armRU', a: 'shoulderR', b: 'elbowR',  z: 120, grab: 26 },
    { id: 'armRL', a: 'elbowR',    b: 'handR',   z: 130, grab: 34 },
    { id: 'legLU', a: 'hipL',      b: 'kneeL',   z:  90, grab: 24, parent: 'hips' },
    { id: 'legLL', a: 'kneeL',     b: 'footL',   z:  95, grab: 30 },
    { id: 'legRU', a: 'hipR',      b: 'kneeR',   z:  90, grab: 24, parent: 'hips' },
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
  // Two rigid blocks, not one: a ribcage above the waist and a pelvis below it,
  // with nothing spanning the two. That gap is the bend. Bracing a shoulder
  // straight to the pelvis — which is what this list used to do — welds the
  // spine shut again no matter how much travel the waist joint is given, and it
  // does it silently, because a brace is satisfied by the body staying stiff.
  braces: [
    // ribcage
    ['shoulderL', 'shoulderR'], ['shoulderL', 'chest'], ['shoulderR', 'chest'],
    ['neck', 'shoulderL'],      ['neck', 'shoulderR'],  ['neck', 'chest'],
    ['shoulderL', 'waist'],     ['shoulderR', 'waist'], ['neck', 'waist'],
    // pelvis
    ['hipL', 'hipR'],           ['hipL', 'pelvis'],     ['hipR', 'pelvis'],
    ['hipL', 'waist'],          ['hipR', 'waist'],
  ],

  // ---- Legs that do not walk through each other ---------------------------
  // Measured along the hip axis as it is at that moment, so it follows the pet
  // over however far it has toppled. 'min' is how much of a gap, in source
  // pixels, the pair must keep — small, because knees really do touch; what
  // they may not do is swap sides, which is what a scissored ragdoll looks like
  // and what nothing else in the solver forbids.
  keepApart: [
    { a: 'kneeL', b: 'kneeR', min: 24, axis: ['hipL', 'hipR'] },
    { a: 'footL', b: 'footR', min: 28, axis: ['hipL', 'hipR'] },
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

    { id: 'tail', img: 'tail.png', bone: 'hips', anchor: { x: 370, y: 867 },
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

  // ---- The skin ------------------------------------------------------------
  // The rig cuts the pet into limbs, and a limb used to be drawn as one rigid
  // stamp: rotate the cut-out about its joint, draw it, done. That is a puppet
  // made of boards. Two boards meeting at an elbow can only scissor — one edge
  // slides over the other and the corner opens — because nothing in that picture
  // knows the two are the same arm.
  //
  // So every cut is laid out as a GRID of quads instead, and each corner of that
  // grid is carried by more than one bone at once, in proportion to how near
  // each bone is. Deep in the forearm that is 100% forearm. Over the elbow it is
  // roughly half forearm and half upper arm, and a corner pulled two ways ends
  // up between the two — which is a crease. Same rule gives a shoulder that
  // rolls, a hip that folds and a waist that creases instead of kinking.
  //
  //   cell       grid spacing in source pixels. Smaller bends more smoothly and
  //              costs more: the drawing work is one clip and one blit per quad,
  //              and halving this quadruples the number of quads. 30 puts about
  //              4 quads across a forearm, which is enough for the crease.
  //   bleed      how far past the NEAREST bone another one may still be and
  //              still get a share of a corner, in source pixels. This is what
  //              keeps a hand held near a hip from being tugged at by the thigh
  //              across the gap between them — and, set too wide, it is the
  //              thing that makes the pet feel like jelly. At 34 the OUTER EDGE
  //              of a forearm still took 11% of its movement from the upper
  //              arm, so the forearm bent along its own length: rubber hose, not
  //              a limb. Down here that is under 2%, and the crease at the elbow
  //              itself is untouched, because at the joint the two bones are
  //              equidistant however sharp the falloff is.
  //   sharpness  how quickly a bone's share falls away with distance. Higher
  //              makes joints crisper and limbs stiffer; lower spreads every
  //              bend out and eventually turns the pet to rubber.
  //   bones      most bones allowed to share one corner.
  //   seamBleed  screen pixels each quad's clip is grown by. Two triangles that
  //              share an edge each antialias their own half of it and the two
  //              halves do not add back up to one opaque line, so without this
  //              there is a faint lattice over the whole pet.
  //
  // Turn 'enabled' off and every bone goes back to the single rotate-and-blit.
  // That is the fastest the rig can draw and the only thing it loses is the
  // bending, so it is the right switch to reach for on a slow machine.
  mesh: {
    enabled: true,
    cell: 30,
    bleed: 24,
    sharpness: 4.6,
    bones: 3,
    eps: 5,
    seamBleed: 0.5,
  },

  // ---- Soft tissue ---------------------------------------------------------
  // Bones are not the only thing that moves. A body carries weight that is not
  // bolted to the skeleton — it is dragged along a beat late and it keeps going
  // a beat after the bone has stopped. Leave that out and every part of the pet
  // arrives at once, which is the difference between a person moving and a
  // sticker being moved.
  //
  // Each entry is one patch of the body. It sits at (x, y) in source pixels,
  // reaches 'radius' pixels around itself, and the mesh corners inside that
  // circle come along with it, most at the middle and none at the edge. It
  // cannot move a joint — only the skin over one — because a wobble that could
  // push the skeleton would feed itself and the pet would shiver on the spot.
  //
  //   lag        0..1, how much of the bone's motion the flesh does NOT follow.
  //              0 welds it to the bone. This is the number that decides jelly
  //              or body, and it wants to be far smaller than it feels like it
  //              should: while the pet is being dragged the patch sits pegged
  //              at its cap the whole time, so what reads on screen is the CAP,
  //              continuously, not an occasional wobble. A third is plenty for a
  //              chest; a tenth is right for a thigh.
  //   stiffness  how hard it springs back. Together with 'damping' this sets the
  //              bounce: ~110 and ~8 is about two visible swings and gone.
  //   damping    how fast the bounce dies. Raise it if a patch keeps ringing.
  //   sag        share of gravity it droops under while at rest. Tiny numbers.
  //   maxOffset  hard cap in source pixels. Nothing may travel further than
  //              this, whatever it is hit with — the backstop that keeps a big
  //              throw from tearing the mesh open, and, because a dragged patch
  //              lives against it, the number you actually see.
  //   weight     scales the whole effect for this patch, for trimming one down
  //              without re-tuning its spring.
  //
  // The list is optional and every entry in it is independent: delete one, or
  // the lot, and the pet simply moves as a skeleton with skin on it.
  // The damping on each is set against its own stiffness so that every patch
  // gives one soft bounce and stops — damping / (2 x sqrt(stiffness)) is about
  // 0.7 for the chest and nearer 1 further down, where flesh does not bounce so
  // much as arrive late. Change stiffness and change damping with it, or the
  // patch will either ring like a spring or stop dead.
  // Placed on the drawn skeleton: the bust between chest and waist, the belly
  // between waist and pelvis, and the thighs and upper arms halfway along their
  // bones. The radii are cut to the body — this character's torso is only about
  // 110px wide, so a patch reaching 70px from the spine was covering the arms
  // as well and moving them with the chest.
  softTissue: [
    { id: 'bustL',  x: 395, y: 682, radius: 58, lag: 0.34, stiffness: 190, damping: 20, sag: 0.010, maxOffset: 3.5 },
    { id: 'bustR',  x: 457, y: 682, radius: 58, lag: 0.34, stiffness: 190, damping: 20, sag: 0.010, maxOffset: 3.5 },
    { id: 'belly',  x: 425, y: 805, radius: 72, lag: 0.16, stiffness: 240, damping: 28, sag: 0.005, maxOffset: 2 },
    { id: 'hipL',   x: 396, y: 872, radius: 62, lag: 0.12, stiffness: 280, damping: 32, maxOffset: 1.6 },
    { id: 'hipR',   x: 454, y: 872, radius: 62, lag: 0.12, stiffness: 280, damping: 32, maxOffset: 1.6 },
    { id: 'thighL', x: 389, y: 890, radius: 46, lag: 0.11, stiffness: 290, damping: 33, maxOffset: 1.5 },
    { id: 'thighR', x: 461, y: 890, radius: 46, lag: 0.11, stiffness: 290, damping: 33, maxOffset: 1.5 },
    { id: 'armL',   x: 334, y: 652, radius: 40, lag: 0.09, stiffness: 320, damping: 36, maxOffset: 1.1 },
    { id: 'armR',   x: 516, y: 651, radius: 40, lag: 0.09, stiffness: 320, damping: 36, maxOffset: 1.1 },
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

    // ---- How heavy each joint is --------------------------------------
    // Equal weights make a body that answers every shove by the same amount
    // everywhere — a mobile, not a person. Real limbs taper hard: a hand is a
    // small fraction of the arm swinging it, so it whips out and overshoots,
    // while the hips barely notice the same push. One number per joint, and it
    // is the cheapest realism in this file. Anything left out weighs 1.
    masses: {
      headTop: 1.7,  neck: 1.2,
      chest:   3.2,  waist: 2.8,  pelvis: 3.0,
      shoulderL: 1.9, shoulderR: 1.9,
      elbowL: 0.85,  elbowR: 0.85,
      handL:  0.42,  handR:  0.42,
      hipL:   2.2,   hipR:   2.2,
      kneeL:  0.95,  kneeR:  0.95,
      footL:  0.5,   footR:  0.5,
    },

    // ---- How a joint reaches the end of its travel ---------------------
    // Snapping to the limit reads as a doll hitting a stop. A knee running out
    // of travel is ligament taking up load, and it slows over the last few
    // degrees. Inside 'limitSoft' degrees of the limit the correction is only
    // partial — 'limitFloor' of the way at the very edge, all of the way at the
    // far side of the cushion — so the bone-length and brace passes that run
    // afterwards get a say and the limb eases in. Past the cushion it is
    // absolute: past the cushion a joint is not stiff, it is broken.
    // 12 and 0.35 were too generous: a quarter-turn of mush at every joint,
    // and it is the joints hitting their stops that make a ragdoll read as a
    // skeleton rather than a rope. Six degrees is still not a wall — it is the
    // last of the travel going soft — but the limb arrives.
    limitSoft: 6,
    limitFloor: 0.6,

    // Extra downward kick given to the soft tissue on a landing, in source
    // px/s, scaled by how hard the landing was and by how loose each patch is.
    // The squash would shake the flesh on its own — but it arrives over the
    // next few frames, and an impact does not.
    landJolt: 35,

    // ---- The one knob for "too soft" / "not soft enough" ---------------
    // Scales every softTissue entry's lag and maxOffset together, so the whole
    // body firms up or loosens without re-tuning nine springs. 1 is the list as
    // written below. Drop to 0.5 for a stiffer, more wooden ragdoll; 0 welds the
    // flesh to the bone and turns the whole feature off. Going much above 1 is
    // where it stops looking like a body carrying its own weight and starts
    // looking like jelly.
    softness: 1,

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
