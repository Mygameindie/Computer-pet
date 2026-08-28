# Drawing the pet's back parts

The pet's body is cut into limbs automatically along the skeleton in
`pet_rig_config.js`, so **you never separate an arm, a leg, the head or the
torso** — those live in `images/base.png` and the rig handles them.

What does need its own file is anything that sits **behind** the body and spans
more than one bone: a cape, long hair, wings, a tail. The rig gives every pixel
to the bone nearest it, so a cape draped across both legs gets shared out
between them and tears apart the moment the pet is thrown.

> **The test:** if the pet moved its arm, would this move *with* the arm?
> A sleeve would — it belongs in `base.png`. A cape would not — it needs its own file.

## The files

Every part is optional. A missing PNG simply draws nothing, so you can add them
one at a time. Draw each on its own transparent canvas the **same size as
`base.png`** (851 × 1134), positioned exactly where it sits on the body — the
same way a piece of clothing lines up.

| file | hangs off | how it moves |
|---|---|---|
| `images/wings.png` | torso | **two** pieces — the config splits the one PNG down the gap between the wings so each beats on its own pivot |
| `images/cape.png` | torso | one piece, trails the body |
| `images/tail.png` | hips | chain — whips and settles. `tools/skeleton_tail.png` shows where it hangs and which way to draw it |
| `images/ponytail.png` | head | chain — whips and settles |
| `images/hair_back.png` | head | one piece, trails the head |
| `images/hair_front.png` | head | drawn **over** the body and its clothes |

`tools/skeleton.png` and `tools/skeleton_wings.png` are the hand-drawn bones the
rig is traced from — the body's joints and the two wing pivots. Redraw over them
to move a joint; see the note at the top of `pet_rig_config.js` for how the
strokes are read.

`parts_guide_*.png` in this folder is a tracing template: the character with the
skeleton, the joints and each part's pivot drawn on top. Open it as a background
layer in your drawing app and draw against it.

Character 2 uses the same names with `_2` on the end — `tail_2.png`,
`wings_2.png`. If a `_2` file is missing, character 1's art is used and tinted.

Which parts exist, and what each is bound to, is set in `pet_rig_config.js`
under `backParts` / `frontParts`. Add an entry there to introduce a new one.

## How the body moves

The pet is one flat PNG, cut into limbs along the skeleton. What decides whether
that reads as a person or as a puppet is three things, all of them in
`pet_rig_config.js`:

**The skin is a grid.** Each limb is drawn through a mesh of quads, and every
corner of that mesh is carried by more than one bone at once, in proportion to
how near each bone is. Deep in a forearm that is 100% forearm; over the elbow it
is half forearm and half upper arm, and a corner pulled two ways ends up between
them — which is a crease. That is what stops a joint scissoring when it folds,
and it is also why there is no seam to hide any more. `mesh.cell` is the grid
spacing: smaller bends more smoothly and costs more.

**The spine bends.** There are two spine bones, `torso` and `hips`, meeting at
the waist. One chest-to-pelvis plank cannot bend, and a body that cannot bend at
the waist stays board-straight through a throw, which is the loudest tell that
something is not alive.

**Flesh has weight.** `softTissue` is a list of patches — chest, belly, hips,
thighs, upper arms — that are dragged along a beat late and keep going a beat
after the bone has stopped. Each one is a point with a radius; the mesh corners
inside that radius come with it. They cannot move a joint, only the skin over
one.

Alongside those: each joint has a `mass`, so a hand whips where a hip barely
registers the same shove; the joint ranges are a person's rather than a doll's,
with elbows and knees that only fold one way; and the knees and ankles are kept
on their own sides of each other, so a hard landing cannot leave the legs
crossed for the rest of the session.

## Handing the rig a drawing

Drawing the bones works well and it is how the current skeleton was made. Two
of these are about being readable; the last one is the one that actually goes
wrong.

**Same canvas, lined up.** 851 x 1134, transparent, sitting exactly over the
art. Every stroke is then already in the coordinates the config uses and nothing
has to be scaled or guessed.

**Black is a bone.** One stroke from one joint to the next. Strokes may touch or
cross — the spine and the shoulder bar crossing is fine. Bones are measured off
the stroke's two ends, so a stroke that stops short of the joint moves the joint.
Where two bones meet in line with each other — a shoulder, elbow and hand all on
one straight arm — there is no bend to find, so the middle joint lands halfway.
Put a visible kink or a dot where you want it instead and that is used.

**Draw it on the thing it belongs to.** The wing bones came in drawn on top of
the wings, and there was nothing to work out: two strokes, two wings, one pivot
each. The same two strokes on an empty canvas would have been two lines in
space.

**A drawing says WHERE. It cannot say WHAT.** This is the one that costs time. A
stroke by the hip is a thigh bone, or a tail, or the way something should swing,
or a note to look at that spot — and the drawing is identical in all four cases.
So either use a second colour and say once what it means, or put the answer in
the filename (`skeleton_wings.png`, `skeleton_tail.png`), or just write one word
in the message. One word beats any amount of redrawing.

Then tick **lay the drawing over the rig** in `tools/rig_check.html` — it puts
`tools/skeleton.png` straight over the pet standing at rest. A red bone sitting
off the black stroke it was traced from is a wrong number, and it shows up there
immediately.

## Checking the rig

Open `tools/rig_check.html` **through a local server** — a `file://` page cannot
read the sprite back, and reading it back is how the rig cuts the pet up:

```
python3 -m http.server
# then http://localhost:8000/tools/rig_check.html
```

It draws the pet in the four poses that break a rig — standing, folded, thrown,
landed — with switches for the grid, its wireframe, and the soft-tissue patches.
**Run the stress test** puts it through four thousand frames of being thrown,
dragged by a random limb and dropped, and reports the three ways a ragdoll
fails: a point that has left the number line, the worst a bone stretched, and
whether the legs ever ended up crossed. The last of those must be zero — nothing
pulls a mirrored pelvis back on its own.

It changes nothing on disk. Add `?pet=1` to check character 2.

Press **Ctrl+Shift+B** in the app itself for the same overlay live.

## Checking your part files

Open `tools/parts_preview.html` in a browser. It loads `images/`, lists which
part files it found, and shows the pet rigged and moving — at rest, walking
about, thrown, or dragged by a hand. Toggle any part off to see it without,
turn on the skeleton to check a pivot, then redraw, save, and hit **Reload art**.

It changes nothing on disk. Add `?pet=1` to the URL to preview character 2.

## What is hidden behind the body

A part drawn into `base.png` is missing whatever the body was covering — cut a
cape out and you get a body-shaped bite in the middle of it. The parts that ship
here were rebuilt automatically by filling that gap with the part's flat colour,
which works because this art is flat-shaded. If you redraw a part by hand,
**draw the whole thing**, including the section the body hides. It costs nothing
when the pet stands still and it is what stops a hole appearing the moment the
part swings.

`images/base_original.png` is the untouched sprite the parts were taken out of,
kept for reference. Nothing loads it.

## If you redraw the body in a different pose

The joints in `pet_rig_config.js` have to sit where the joints are in your
artwork — that is the whole contract, and nothing else needs re-measuring. The
config ships two poses, `natural` and `tpose`; pick one with `restPose`, or copy
a block and move the numbers onto your art. Press **Ctrl+Shift+B** in the app, or
tick *Skeleton and joints* in the preview, to see exactly where they land.
