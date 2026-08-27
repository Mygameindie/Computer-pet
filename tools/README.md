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
| `images/wings.png` | torso | one piece, trails the body, flaps in the air |
| `images/cape.png` | torso | one piece, trails the body |
| `images/tail.png` | pelvis | chain — whips and settles |
| `images/ponytail.png` | head | chain — whips and settles |
| `images/hair_back.png` | head | one piece, trails the head |
| `images/hair_front.png` | head | drawn **over** the body and its clothes |

`parts_guide_*.png` in this folder is a tracing template: the character with the
skeleton, the joints and each part's pivot drawn on top. Open it as a background
layer in your drawing app and draw against it.

Character 2 uses the same names with `_2` on the end — `tail_2.png`,
`wings_2.png`. If a `_2` file is missing, character 1's art is used and tinted.

Which parts exist, and what each is bound to, is set in `pet_rig_config.js`
under `backParts` / `frontParts`. Add an entry there to introduce a new one.

## Checking your work

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
