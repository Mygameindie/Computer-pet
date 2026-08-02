// ===========================================================
// 👕 outfit_system.js — Layered dress-up system
// ===========================================================
// Ported from the pet template (outfit_system_single_sprite.js) to the desktop
// overlay. Same behaviour, minus the canvas-game modes: there is no shower
// here, so the shower clothes-rules are gone.
//
// Reads everything from window.OUTFIT_CONFIG (see outfit_config.js) — one
// plain-JS source of truth, loaded synchronously (no fetch, can't glitch).
//
// To ADD CLOTHES you only edit outfit_config.js. This file just renders and
// applies that config: the Dress Up panel (with image thumbnails), the colour
// tinting, the layering by z, and the girl/boy clothing rules.
//
// The Dress Up button and panel are picked up from index.html when they already
// exist (#dressup-btn / #dressup-panel), which is how the desktop build docks
// them next to the selected pet instead of pinning them to a screen corner.
//
// Rules preserved from before:
// - Top underwear + bottom underwear, OR a one-piece (mutually exclusive).
// - A one-piece is a complete set: selecting it clears top/bottom underwear.
// - Switching OFF a one-piece to a separate piece completes the set: picking
//   top1 also puts on the matching bottom1 (and vice versa).
// - Once you're already wearing separates, they are independent: changing one
//   does NOT change the other, so you can mix freely (top1 + bottom2).
// - Dress clears top + bottom; top or bottom clears dress.
(() => {
  const DEFAULT_COLOR = "Original";
  const COLORS = {
    Original: null,
    Red: "#ff3b30", Orange: "#ff9500", Yellow: "#ffcc00",
    Green: "#34c759", Cyan: "#32ade6", Blue: "#007aff",
    Purple: "#af52de", Pink: "#ff2d55",
  };

  // ---- Built-in fallback so the game still runs if the config is missing ----
  const FALLBACK_CONFIG = {
    categories: [
      { key: "topUnderwear", label: "Top Underwear", z: 60 },
      { key: "bottomUnderwear", label: "Bottom Underwear / Boxers", z: 50 },
      { key: "onepieceUnderwear", label: "One-Piece Underwear", z: 65 },
      { key: "top", label: "Top", z: 120 },
      { key: "bottom", label: "Pants / Skirt", z: 110 },
      { key: "dress", label: "Dress", z: 130 },
      { key: "shoes", label: "Shoes", z: 90 },
      { key: "hat", label: "Hat", z: 180 },
    ],
    pet1: {},
    defaults: { pet1: {} },
  };

  // ---- Helpers --------------------------------------------------------------
  function img(src) {
    const im = new Image();
    im._failed = false;
    im.onerror = () => { im._failed = true; scheduleArtRefresh(); };
    im.onload = () => { scheduleArtRefresh(); };
    im.src = src; // asset_path_fix.js rewrites bare names to images/<name>
    return im;
  }

  // Characters can have different wardrobes (e.g. pet 2 has no hat art). When
  // an item's PNG finishes loading — or fails — re-check everything once so
  // missing items disappear from the panel, invalid selections get cleared,
  // and the button count stays honest for whichever character is active.
  let artRefreshTimer = 0;
  function scheduleArtRefresh() {
    clearTimeout(artRefreshTimer);
    artRefreshTimer = setTimeout(() => {
      validateSelections();
      if (panel && panel.style.display !== "none") renderPanel();
      updateButtonLabel();
      // Tell the overlay scene to repaint — a garment that just finished
      // loading needs to appear on the pet, not only in the panel.
      window.dispatchEvent(new CustomEvent("outfit:art-changed"));
    }, 60);
  }

  // An item is available if its art hasn't failed to load. Id 0 ("None") is
  // always available. Art that is still loading counts as available; if it
  // later fails, scheduleArtRefresh() hides it.
  function itemAvailable(it) {
    if (!it) return false;
    if (it.id === 0 || it.id === "0") return true;
    return !!(it.img && !it.img._failed);
  }
  function availableItems(p, key) {
    const cat = (window.dressUpCatalog[p] || {})[key];
    const out = {};
    if (!cat) return out;
    Object.entries(cat.items || {}).forEach(([id, it]) => {
      if (itemAvailable(it)) out[id] = it;
    });
    return out;
  }

  // "top2" -> "Top 2", "top1_2" -> "Top 1", "boxers1_2" -> "Boxers 1"
  function humanize(id) {
    const base = String(id).replace(/_\d+$/, "");
    const m = base.match(/^([a-zA-Z]+?)(\d+)$/);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + " " + m[2];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // Accept either "top1" or { id, label, prefix }.
  function normItem(entry) {
    if (entry === null || entry === undefined) return null;
    if (typeof entry === "string" || typeof entry === "number") {
      const id = String(entry);
      return { id, label: humanize(id), prefix: id };
    }
    const id = entry.id || entry.prefix;
    if (!id) return null;
    return {
      id: String(id),
      label: entry.label || humanize(id),
      prefix: String(entry.prefix || id),
    };
  }

  function emptyCat(def) {
    return {
      label: def.label || def.key,
      z: Number(def.z) || 100,
      items: { 0: { id: 0, label: "None", img: null } },
    };
  }

  // ---- Build the catalog from the config (synchronous) ----------------------
  const cfg = (window.OUTFIT_CONFIG && Array.isArray(window.OUTFIT_CONFIG.categories))
    ? window.OUTFIT_CONFIG
    : FALLBACK_CONFIG;

  const cats = cfg.categories.map(c => ({
    key: c.key, label: c.label || c.key, z: Number(c.z) || 100,
  }));

  // Both pets share the same dress-up system. Character 2 (index 1) reads its
  // wardrobe from cfg.pet2 (same structure as pet1, "_2" art).
  const PETS = [0, 1];
  const wardrobeFor = p => (p === 1 ? cfg.pet2 : cfg.pet1) || {};
  const defaultsFor = p => (cfg.defaults && (p === 1 ? cfg.defaults.pet2 : cfg.defaults.pet1)) || {};

  function buildCatalog() {
    const catalog = {};
    PETS.forEach(p => { catalog[p] = {}; cats.forEach(c => { catalog[p][c.key] = emptyCat(c); }); });
    PETS.forEach(p => {
      const wardrobe = wardrobeFor(p);
      cats.forEach(c => {
        const list = wardrobe[c.key];
        if (!Array.isArray(list)) return;
        list.forEach(entry => {
          const it = normItem(entry);
          if (it) catalog[p][c.key].items[it.id] = { id: it.id, label: it.label, img: img(`${it.prefix}.png`) };
        });
      });
    });
    return catalog;
  }

  const defaults = (() => {
    const out = {};
    PETS.forEach(p => { out[p] = {}; const src = defaultsFor(p); cats.forEach(c => { out[p][c.key] = src[c.key] != null ? src[c.key] : 0; }); });
    return out;
  })();

  window.dressUpCatalog = buildCatalog();
  if (typeof window.activePetIndex !== "number") window.activePetIndex = 0;

  function makeSelected() {
    return PETS.map(p => {
      const o = {};
      cats.forEach(c => o[c.key] = defaults[p][c.key] != null ? defaults[p][c.key] : 0);
      return o;
    });
  }
  function makeColors() {
    return PETS.map(() => {
      const o = {};
      cats.forEach(c => o[c.key] = DEFAULT_COLOR);
      return o;
    });
  }

  window.selectedClothes = window.selectedClothes || makeSelected();
  window.clothingColors = window.clothingColors || makeColors();
  window.currentOutfits = PETS.map(() => 0);
  window.currentOutfit = 0;

  function activePet() {
    const p = window.activePetIndex;
    return PETS.includes(p) ? p : 0;
  }

  // Only show categories this character actually owns clothes for. This is what
  // enforces the boy clothing rules: character 2 (boy) has no top underwear,
  // one-piece, dress, or bunnysuit-bow items, so those tabs never appear.
  // Items whose art is missing don't count either, so a character without a
  // hat PNG simply has no Hat tab — each character's panel matches its art.
  function catKeys(p = activePet()) {
    return cats.map(c => c.key).filter(k =>
      Object.keys(availableItems(p, k)).length > 1 // more than just "None"
    );
  }

  // Clear any worn item that this character doesn't actually have (not in its
  // catalog, or its art failed to load). Keeps each character's outfit
  // consistent with its own wardrobe after switching characters or presets.
  function validateSelections() {
    PETS.forEach(p => {
      const sc = window.selectedClothes && window.selectedClothes[p];
      if (!sc) return;
      const catalog = window.dressUpCatalog[p] || {};
      cats.forEach(c => {
        const id = sc[c.key];
        if (id === 0 || id === "0" || id == null) return;
        const it = catalog[c.key] && catalog[c.key].items && catalog[c.key].items[id];
        if (!itemAvailable(it)) sc[c.key] = 0;
      });
    });
  }

  function normalizeState() {
    const sel = makeSelected();
    const cols = makeColors();
    PETS.forEach(p => {
      window.selectedClothes[p] = window.selectedClothes[p] || {};
      window.clothingColors[p] = window.clothingColors[p] || {};
      cats.forEach(c => {
        if (window.selectedClothes[p][c.key] === undefined) window.selectedClothes[p][c.key] = sel[p][c.key];
        if (window.clothingColors[p][c.key] === undefined) window.clothingColors[p][c.key] = cols[p][c.key];
      });
    });
  }

  // ---- Clothing rules -------------------------------------------------------
  // Set number = the trailing digits of an id ("bottomunderwear3" -> "3").
  function setNumberFromId(id) {
    const m = String(id || "").match(/(\d+)(?:_\d+)?$/);
    return m ? m[1] : null;
  }
  // Find an item in a category whose set number matches n ("3" -> "bottomunderwear3").
  function findItemBySetNumber(p, category, n) {
    if (!n) return 0;
    const items = (window.dressUpCatalog[p] && window.dressUpCatalog[p][category] && window.dressUpCatalog[p][category].items) || {};
    const ids = Object.keys(items).filter(id => id !== "0");
    return ids.find(id => setNumberFromId(id) === String(n)) || 0;
  }
  function applyUnderwearRules(p, category, id) {
    if (id === 0 || id === "0") return;
    const sc = window.selectedClothes[p];

    // A one-piece is a complete set: it replaces the separate top + bottom.
    if (category === "onepieceUnderwear") {
      sc.topUnderwear = 0;
      sc.bottomUnderwear = 0;
      return;
    }

    if (category === "topUnderwear" || category === "bottomUnderwear") {
      // Switching to separates always removes the (exclusive) one-piece.
      const cameFromOnepiece = sc.onepieceUnderwear && sc.onepieceUnderwear !== "0";
      sc.onepieceUnderwear = 0;

      // Coming OFF a one-piece, complete the set by adding the matching
      // counterpart (top1 -> also bottom1). But once you're already wearing
      // separates, leave the other piece alone so you can mix freely
      // (top1 + bottom1 -> top1 + bottom2).
      if (cameFromOnepiece) {
        const other = (category === "topUnderwear") ? "bottomUnderwear" : "topUnderwear";
        const match = findItemBySetNumber(p, other, setNumberFromId(id));
        if (match) sc[other] = match;
      }
    }
  }
  function applyDressRules(p, category, id) {
    if (id === 0 || id === "0") return;
    const sc = window.selectedClothes[p];
    // Full-body garments (dress, bodysuit) replace the separate top + bottom,
    // and replace each other (you can't wear a dress and a bodysuit at once).
    if (category === "dress" || category === "bodysuit") {
      sc.top = 0;
      sc.bottom = 0;
      sc.dress = (category === "dress") ? sc.dress : 0;
      sc.bodysuit = (category === "bodysuit") ? sc.bodysuit : 0;
      return;
    }
    // Putting on a separate top/bottom removes any full-body garment.
    if (category === "top" || category === "bottom") {
      sc.dress = 0;
      sc.bodysuit = 0;
    }
  }
  function applyClothingRules(p, category, id) {
    applyUnderwearRules(p, category, id);
    applyDressRules(p, category, id);
  }

  // ---- Colour tinting -------------------------------------------------------
  const tintCache = new Map();
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function tintedImage(source, hex) {
    if (!hex || !source || source._failed || !source.complete || !source.naturalWidth) return source;
    const key = `${source.src}|${hex}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const rgb = hexToRgb(hex);
    if (!rgb) return source;
    const cv = document.createElement("canvas");
    cv.width = source.naturalWidth;
    cv.height = source.naturalHeight;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    try {
      cx.drawImage(source, 0, 0);
      const imageData = cx.getImageData(0, 0, cv.width, cv.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const shade = Math.max(0.18, Math.min(1.25, lum * 1.35));
        d[i] = Math.min(255, rgb.r * shade);
        d[i + 1] = Math.min(255, rgb.g * shade);
        d[i + 2] = Math.min(255, rgb.b * shade);
      }
      cx.putImageData(imageData, 0, 0);
    } catch (_) {
      return source;
    }
    const out = new Image();
    out.src = cv.toDataURL("image/png");
    tintCache.set(key, out);
    return out;
  }
  function safeDraw(ctx, image, x, y, w, h) {
    if (!image || image._failed || !image.complete || !image.naturalWidth) return false;
    ctx.drawImage(image, x, y, w, h);
    return true;
  }

  // ---- UI: button + panel ---------------------------------------------------
  let selectedCategory = catKeys()[0] || (cats[0] && cats[0].key) || "top";

  const btnCss = "border:0;border-radius:9px;padding:7px 10px;margin:3px;background:rgba(0,0,0,.08);cursor:pointer;font-size:13px;white-space:nowrap;";
  function btn(text) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = btnCss;
    return b;
  }

  let dressBtn = document.getElementById("dressup-btn");
  if (!dressBtn) {
    dressBtn = document.createElement("button");
    dressBtn.id = "dressup-btn";
    dressBtn.style.cssText = "position:fixed;right:10px;bottom:calc(65px + env(safe-area-inset-bottom));z-index:9998;padding:6px 12px;font-size:clamp(11px,2.5vw,14px);cursor:pointer;border-radius:8px;border:none;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap;";
    document.body.appendChild(dressBtn);
  }
  window.clothesBtn = dressBtn;

  let panel = document.getElementById("dressup-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "dressup-panel";
    panel.style.cssText = "position:fixed;right:10px;bottom:calc(108px + env(safe-area-inset-bottom));width:min(360px,calc(100vw - 20px));max-height:54vh;overflow:auto;display:none;z-index:9999;padding:10px;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 6px 24px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    document.body.appendChild(panel);
  }

  function updateButtonLabel() {
    const p = activePet();
    // Count only items this character actually has — a selection whose art is
    // missing (e.g. a hat this character has no PNG for) doesn't count.
    const count = catKeys(p).filter(k => {
      const id = window.selectedClothes[p] && window.selectedClothes[p][k];
      if (id === 0 || id === "0" || id == null) return false;
      return itemAvailable(availableItems(p, k)[id]);
    }).length;
    dressBtn.textContent = `👗 Dress Up (${count} item${count === 1 ? "" : "s"})`;
  }

  // A clothing item shown as an image thumbnail (falls back to text/emoji).
  function itemThumb(it, active, onClick) {
    const b = document.createElement("button");
    b.title = it.label || String(it.id);
    b.style.cssText =
      "display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;" +
      "width:66px;height:78px;padding:5px;cursor:pointer;border-radius:10px;" +
      `border:2px solid ${active ? "#f59e0b" : "rgba(0,0,0,.12)"};` +
      `background:${active ? "#fff7e6" : "#fff"};`;

    const isNone = it.id === 0 || it.id === "0";
    if (isNone) {
      const icon = document.createElement("div");
      icon.textContent = "🚫";
      icon.style.cssText = "flex:1;display:flex;align-items:center;font-size:24px;opacity:.7;";
      b.appendChild(icon);
    } else if (it.img && !it.img._failed) {
      const im = document.createElement("img");
      im.src = it.img.src;
      im.alt = it.label || "";
      im.draggable = false;
      im.style.cssText = "flex:1;width:48px;height:48px;object-fit:contain;";
      im.onerror = () => { im.replaceWith(emojiFallback()); };
      b.appendChild(im);
    } else {
      b.appendChild(emojiFallback());
    }

    const lab = document.createElement("div");
    lab.textContent = it.label || String(it.id);
    lab.style.cssText = "font-size:10px;line-height:1.1;text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    b.appendChild(lab);

    b.onclick = onClick;
    return b;

    function emojiFallback() {
      const d = document.createElement("div");
      d.textContent = "👕";
      d.style.cssText = "flex:1;display:flex;align-items:center;font-size:24px;opacity:.55;";
      return d;
    }
  }

  function panelOpen() {
    return panel.style.display !== "none";
  }

  // Rebuilding the panel is only worth doing when it is on screen. The desktop
  // shell re-syncs shared state on every physics frame while a pet is falling,
  // and re-rendering a hidden panel that often used to throw away in-flight
  // clicks and reset the scroll position for no reason at all.
  function renderPanel() {
    if (!panelOpen()) return;

    const p = activePet();
    const catalog = window.dressUpCatalog[p] || window.dressUpCatalog[0] || {};
    const keys = catKeys(p);
    if (!keys.includes(selectedCategory)) selectedCategory = keys[0] || (cats[0] && cats[0].key);
    const scroll = panel.scrollTop;   // keep the reader's place across rebuilds
    panel.innerHTML = "";

    // Title + close
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center;";
    title.innerHTML = `<span>Dress Up</span>`;
    const close = btn("✕");
    close.style.padding = "4px 8px";
    close.onclick = () => { showPanel(false); };
    title.appendChild(close);
    panel.appendChild(title);

    // Which character to dress (both share the same wardrobe system)
    const petRow = document.createElement("div");
    petRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
    PETS.forEach(pi => {
      const b = btn(`🐾 Character ${pi + 1}`);
      if (pi === p) b.style.cssText += "background:#fff7e6;border:2px solid #f59e0b;font-weight:700;";
      b.onclick = () => { if (typeof window.setActivePet === "function") window.setActivePet(pi); };
      petRow.appendChild(b);
    });
    panel.appendChild(petRow);

    // Category tabs. They wrap instead of scrolling sideways: a horizontal
    // scroller is close to unusable with a mouse, and on the desktop overlay
    // there is no touch to swipe it with.
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;padding-bottom:4px;margin-bottom:8px;";
    keys.forEach(k => {
      const b = btn(catalog[k].label || k);
      if (k === selectedCategory) b.style.cssText += "background:rgba(0,0,0,.22);font-weight:700;";
      b.onclick = () => { selectedCategory = k; renderPanel(); };
      row.appendChild(b);
    });
    panel.appendChild(row);

    const cat = catalog[selectedCategory];
    if (!keys.length || !cat) {
      // No wardrobe for this character — say so instead of showing an empty
      // box that looks like the panel is broken.
      const empty = document.createElement("div");
      empty.style.cssText = "padding:14px 4px;font-size:12px;line-height:1.5;opacity:.75;";
      empty.textContent =
        `No clothes found for Character ${p + 1}. Drop the PNGs into images/ and ` +
        `list their names in outfit_config.js — they show up here automatically.`;
      panel.appendChild(empty);
      panel.scrollTop = scroll;
      updateButtonLabel();
      return;
    }

    // Items as thumbnails
    const itemTitle = document.createElement("div");
    itemTitle.textContent = "Item";
    itemTitle.style.cssText = "font-weight:600;margin:4px 0;";
    panel.appendChild(itemTitle);

    const items = document.createElement("div");
    items.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;";
    // Only offer items this character has art for.
    Object.entries(availableItems(p, selectedCategory)).forEach(([id, it]) => {
      const active = String(window.selectedClothes[p] && window.selectedClothes[p][selectedCategory]) === String(id);
      const b = itemThumb(it, active, () => {
        window.selectedClothes[p][selectedCategory] = id === "0" ? 0 : id;
        applyClothingRules(p, selectedCategory, window.selectedClothes[p][selectedCategory]);
        renderPanel();
        updateButtonLabel();
      });
      items.appendChild(b);
    });
    panel.appendChild(items);

    // Colours
    const colorTitle = document.createElement("div");
    colorTitle.textContent = "Color";
    colorTitle.style.cssText = "font-weight:600;margin:8px 0 4px;";
    panel.appendChild(colorTitle);

    const colorRow = document.createElement("div");
    colorRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    Object.entries(COLORS).forEach(([name, hex]) => {
      const active = ((window.clothingColors[p] && window.clothingColors[p][selectedCategory]) || DEFAULT_COLOR) === name;
      const b = btn(name === DEFAULT_COLOR ? DEFAULT_COLOR : "");
      b.title = name;
      b.style.cssText += `min-width:${name === DEFAULT_COLOR ? "72px" : "30px"};height:30px;border:${active ? "2px solid #111" : "1px solid rgba(0,0,0,.2)"};background:${hex || "linear-gradient(45deg,#fff,#ddd)"};`;
      b.onclick = () => { window.clothingColors[p][selectedCategory] = name; renderPanel(); };
      colorRow.appendChild(b);
    });
    panel.appendChild(colorRow);

    const note = document.createElement("div");
    note.textContent = "Tip: add new clothes in outfit_config.js — drop the image in images/ and add its name to the list.";
    note.style.cssText = "font-size:11px;opacity:.6;margin-top:8px;";
    panel.appendChild(note);
    panel.scrollTop = scroll;
    updateButtonLabel();
  }

  // Open/close in one place so the panel is always rendered when it becomes
  // visible — renderPanel() deliberately does nothing while it is hidden.
  function showPanel(open) {
    panel.style.display = open ? "block" : "none";
    if (open) {
      // The two panels share the same slot under the pet; only one at a time.
      const presets = document.getElementById("preset-panel");
      if (presets) presets.style.display = "none";
      renderPanel();
    } else {
      updateButtonLabel();
    }
  }

  dressBtn.onclick = () => { showPanel(!panelOpen()); };

  // ---- Public draw + lifecycle API (used by every mode) ---------------------
  // Lets other systems (e.g. outfit_presets.js) refresh the Dress Up panel and
  // button after they change window.selectedClothes / window.clothingColors.
  window.refreshDressUpUI = function () {
    normalizeState();
    validateSelections();
    renderPanel();
    updateButtonLabel();
  };

  window.drawOutfitOverlay = function (ctx, state, x, y, w, h, petIndex) {
    const p = typeof petIndex === "number" ? petIndex : activePet();
    const catalog = window.dressUpCatalog[p] || window.dressUpCatalog[0] || {};
    let drew = false;
    catKeys(p).slice().sort((a, b) => (catalog[a].z || 0) - (catalog[b].z || 0)).forEach(k => {
      const id = (window.selectedClothes[p] && window.selectedClothes[p][k]) ?? 0;
      if (id === 0 || id === "0") return;
      const it = catalog[k] && catalog[k].items && catalog[k].items[id];
      if (!it || !it.img || it.img._failed) return;
      const hex = COLORS[(window.clothingColors[p] && window.clothingColors[p][k]) || DEFAULT_COLOR] || null;
      const drawImg = hex ? tintedImage(it.img, hex) : it.img;
      if (safeDraw(ctx, drawImg, x, y, w, h)) drew = true;
    });
    return drew;
  };

  window.setActivePet = function (petIndex) {
    window.activePetIndex = PETS.includes(petIndex) ? petIndex : 0;
    validateSelections();
    renderPanel();
    updateButtonLabel();
  };

  // ---- Init -----------------------------------------------------------------
  normalizeState();
  validateSelections();
  renderPanel();
  updateButtonLabel();
})();
