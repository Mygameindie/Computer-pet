# Desktop Pet: art source

This branch only holds the pet's artwork, one PNG per body part and per
clothing item. Every file is 851 × 1134 with a transparent background and lines
up with `body_parts/base_full_body.png`.

The code lives on the `default` branch. The body parts and clothes here are pet 1's; pet 2's clothes use the `_2` suffix (e.g. `top1_2.png`) and none are drawn yet. To
change a picture, edit it here (or anywhere), then copy it into the code branch
under the path shown below.

## Body parts → `images/parts/` in the code

| File | What it is |
|---|---|
| `base_full_body.png` | Pet 1: the whole pet in one picture (goes to `images/base.png`) |
| `base_full_body_pet2.png` | Pet 2 (the boy): whole picture (goes to `images/base_2.png`) |
| `head.png` | Head and face |
| `body.png` | Torso and hips |
| `chest_L.png`, `chest_R.png` | Chest (bounces) |
| `arm_L.png`, `arm_R.png` | Arms |
| `leg_L.png`, `leg_R.png` | Legs and feet |
| `back_hair.png` | Back hair (very back) |
| `back_tail.png` | Tail (in front of the hair) |

## Clothes → `images/` in the code

| File | Dress Up tab | Notes |
|---|---|---|
| `topunderwear1.png` | Top Underwear | Bra cups |
| `topunderwear1_over.png` | (part of topunderwear1) | Straps, drawn over the chest |
| `bottomunderwear1.png` | Bottom Underwear | Panties |
| `top1.png` | Top | Top with its sleeves |
| `skirt1.png` | Pants / Skirt | Blows up when falling |
| `socks1.png` | Socks | See-through on purpose |
| `shoes1.png` | Shoes | |

## Template

`template/clothing_template.png` and `template/clothing_guide.png` show where
each body part is, so new clothes line up. The full drawing guide is in
`clothing_template/README.md` on the code branch.
