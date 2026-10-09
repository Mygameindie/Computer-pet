# Drawing clothes

## The canvas

- **851 × 1134 px, transparent background**: the same size as every part in `images/parts/`.
- Open `clothing_template.png` (the pet standing, exactly as it appears in the app) as the
  bottom layer, draw the garment on a new layer above it, then **hide the template and export
  only the garment layer** as a PNG.
- Draw the garment where it sits on the standing pet (arms out, legs apart). Don't move it,
  crop it or resize the canvas.
- The whole garment goes in **one file**. The app cuts it up along the body parts by itself.

## How it gets cut up (`clothing_guide.png`)

Every pixel of a garment moves with the body part under it:

| Area on the canvas | Moves with | Use it for |
|---|---|---|
| Above y = 606 (yellow) | head | hats, glasses, ears, hair clips |
| x < 346 or x > 505, y 606–846 (blue) | that arm | sleeves, gloves, bracelets |
| The two circles on the chest (pink) | the chest (it bounces) | bra, the chest of a top |
| The rest of the middle, down to y = 868 (orange) | body | shirt, waist, belt, collar |
| Below y = 868, split down the middle at x = 425 (green) | left / right leg | pants, socks, shoes |

Tips:
- **Sleeves:** let a sleeve's shoulder end overlap the body a little. The part inside the
  orange area stays on the shoulder, and the rest follows the arm.
- **Pants:** draw both legs; each leg moves on its own. The waistband (above y = 868) stays
  on the body.
- **Skirts and dresses** would be split between the legs and tear, so mark them `hangs: true`
  in `outfit_config.js`. Then everything below the hips hangs from the body in one piece and
  the legs swing underneath. The whole Dress category, and `skirt1`, are set up that way already.
  Mark a skirt `blows: true` instead and, while the pet falls, everything below its waistband
  billows out and lifts (the faster it falls, the more), then settles back once it lands.
  `skirt1` and the Dress category (from y = 820, its waist: `blows: 820`) are set up that way.
- **Extra layers (optional).** One garment can have two more files with the same name plus an ending.
  Both move with the **body** (never with the chest, arms or legs):
  - `<name>_over.png`: drawn **over** the chest. Use it for bra straps: drawn in the main file,
    the part of a strap on the breast bounced with the chest and the strap broke in two.
  - `<name>_under.png`: drawn **under** the chest (the breasts cover it).
  Example, the bra: cups in `topunderwear1.png`, straps in `topunderwear1_over.png`.
- **Stiff garments.** A garment that covers the chest in one solid piece (a crop top, a tank
  top) would tear where the bouncing chest meets the body. Mark it `stiff: true` in
  `outfit_config.js` (`{ id: "top1", stiff: true }`) and it stays whole on the body,
  over the chest. The chest doesn't bounce under it.
- The chest wins over the arms: anything inside the pink circles only ever moves with the chest.
- Give garments an outline (black, like the body art). Colour tinting in the Dress Up panel
  works best on light/white garments.

## File names

Save into `images/` (not `images/parts/`). Character 2 uses the same names with `_2` (`top1_2.png`), listed under `pet2` in `outfit_config.js`. These names are already listed in `outfit_config.js`,
so each one shows up in Dress Up as soon as the file exists:

| Category (Dress Up tab) | File names |
|---|---|
| Top Underwear | `topunderwear1.png`, `topunderwear2.png`, `topunderwear3.png`, `topunderwear4.png` |
| Bottom Underwear / Boxers | `bottomunderwear1.png` … `bottomunderwear4.png` |
| One-Piece Underwear | `onepieceunderwear1.png` |
| Top | `top1.png` |
| Pants / Skirt | `pants1.png`, `skirt1.png` (hangs) |
| Dress | `dress1.png` (hangs) |
| Bodysuit | `bodysuit1.png` |
| Shoes | `shoes1.png` |
| Glove | `glove1.png` |
| Bunnysuit Bow | `bunnysuitbow1.png` |
| Glasses | `glasses1.png` |
| Ears | `ears1.png` |
| Hat | `hat1.png` |

More of one kind: add the number (`top2.png`), then add `"top2"` to that list in
`outfit_config.js`. A new skirt or dress that hangs: `{ id: "skirt2", hangs: true }`.

Layering (front to back): hat, ears, glasses, bunnysuit bow, glove, dress, bodysuit, top,
pants/skirt, shoes, one-piece underwear, top underwear, bottom underwear.
