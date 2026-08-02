// ===========================================================
// 👗 outfit_config.js — THE one place to add / edit clothes
// ===========================================================
//
//  HOW TO ADD A NEW CLOTHING ITEM (3 steps):
//    1. Save the artwork as   images/<name>.png   (transparent PNG, same
//       canvas size as the pet base so it lines up).
//    2. Add "<name>" to the matching list below — under pet1 (character 1)
//       and/or pet2 (character 2). Example: add a 2nd top -> "top2".
//    3. Refresh. Done. It shows up in the Dress Up panel automatically.
//
//  LABELS are made automatically from the name:  "top2" -> "Top 2".
//    Want a custom name? Use an object instead of a string:
//        { id: "top2", label: "Cool Hoodie" }
//
//  CHARACTERS CAN HAVE DIFFERENT CLOTHES. Each character only shows the
//  categories/items it actually has: if a category is missing from pet2's
//  list below — or an item's PNG doesn't exist in images/ — that item (or the
//  whole tab) is hidden for that character automatically. So if character 1
//  has a hat but character 2 doesn't, that's fine: character 2 just won't
//  show a Hat tab, and presets that include a hat simply skip it for him.
//
//  UNDERWEAR: a one-piece is a complete set and replaces the separate top +
//  bottom. Switching OFF a one-piece to a separate piece completes the set
//  (top1 -> also bottom1). Once you're already in separates you can mix any
//  top with any bottom (top1 + bottom2) — they are not re-paired.
//
//  WIND (troll blower): skirt-like clothes (dresses + anything with "skirt"
//  in its name) can have a blown-up variant:  images/<name>_w.png
//  (e.g. skirt1.png -> skirt1_w.png, dress1.png -> dress1_w.png). While the
//  troll-mode blower is held under the garment it swaps to the _w art; if the
//  _w image doesn't exist the garment just stays on its normal art.
//
//  This is a plain JS file (no network/JSON loading) so it can't glitch or
//  fail to load mid-game — it's the smoothest, simplest setup.
// ===========================================================

window.OUTFIT_CONFIG = {

  // -------------------------------------------------------------------------
  // CATEGORIES — order, display name, and draw layer (z). Higher z = on top.
  // Add a line here to create a brand-new clothing category, then add a
  // matching list under pet1 below.
  // -------------------------------------------------------------------------

  categories: [
    { key: "topUnderwear",      label: "Top Underwear",             z: 60  },
    { key: "bottomUnderwear",   label: "Bottom Underwear / Boxers", z: 50  },
    { key: "onepieceUnderwear", label: "One-Piece Underwear",       z: 65  },
    { key: "top",               label: "Top",                       z: 120 },
    { key: "bottom",            label: "Pants / Skirt",             z: 110 },
    { key: "dress",             label: "Dress",                     z: 130 },
    { key: "bodysuit",          label: "Bodysuit",                  z: 128 },
    { key: "shoes",             label: "Shoes",                     z: 90  },
    { key: "glove",             label: "Glove",                     z: 140 },
    { key: "bunnysuitbow",      label: "Bunnysuit Bow",             z: 150 },
    { key: "glasses",           label: "Glasses",                   z: 160 },
    { key: "ears",              label: "Ears",                      z: 170 },
    { key: "hat",               label: "Hat",                       z: 180 },
  ],

  pet1: {
    topUnderwear:      ["topunderwear1", "topunderwear2", "topunderwear3", "topunderwear4"],
    bottomUnderwear:   ["bottomunderwear1", "bottomunderwear2", "bottomunderwear3", "bottomunderwear4"],
    onepieceUnderwear: ["onepieceunderwear1"],
    top:               ["top1"],
    bottom:            ["pants1", "skirt1"],
    dress:             ["dress1"],
    bodysuit:          ["bodysuit1"],
    shoes:             ["shoes1"],
    glove:             ["glove1"],
    bunnysuitbow:      ["bunnysuitbow1"],
    glasses:           ["glasses1"],
    ears:              ["ears1"],
    hat:               ["hat1"],
  },

  // -------------------------------------------------------------------------
  // PET 2 — character 2 is a BOY. Boy clothing rules: no top underwear, no
  // one-piece underwear, no dress, no skirt. He wears boxers and pants instead,
  // but CAN wear a bunnysuit bow and a bodysuit. Art uses the "_2" suffix
  // (e.g. "top1_2"); drop the matching PNGs in images/. (Any category omitted
  // here is hidden from his Dress Up panel.)
  // -------------------------------------------------------------------------
  pet2: {
    bottomUnderwear:   ["bottomunderwear1_2", "boxers1_2"],
    top:               ["top1_2"],
    bottom:            ["pants1_2"],
    bodysuit:          ["bodysuit1_2"],
    shoes:             ["shoes1_2"],
    glove:             ["glove1_2"],
    bunnysuitbow:      ["bunnysuitbow1_2"],
    glasses:           ["glasses1_2"],
    ears:              ["ears1_2"],
    hat:               ["hat1_2"],
  },

  defaults: {
    pet1: {
      onepieceUnderwear: "onepieceunderwear1",
      glove: "glove1",
      shoes: "shoes1",
      ears: "ears1",
      bunnysuitbow: "bunnysuitbow1",
    },
    pet2: {
      bottomUnderwear: "boxers1_2",
      glove: "glove1_2",
      shoes: "shoes1_2",
      hat: "hat1_2",
    },
  },
};
