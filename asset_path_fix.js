// ===========================================================
// 🖼️ Global image path resolver
// Keeps JS filenames simple, but loads images from /images/
// Example: "base.png" -> "images/base.png"
// Does not change audio, JSON, absolute URLs, data/blob URLs,
// or paths that already include a folder.
// ===========================================================
(() => {
  const IMAGE_DIR = 'images/';
  const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i;

  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!desc || !desc.set || !desc.get) return;
  if (HTMLImageElement.prototype.__petTemplateImagePathFixed) return;

  Object.defineProperty(HTMLImageElement.prototype, '__petTemplateImagePathFixed', {
    value: true,
    configurable: false,
  });

  function shouldPrefix(value) {
    if (typeof value !== 'string') return false;
    const src = value.trim();
    if (!src || !IMAGE_EXT.test(src)) return false;

    if (/^(https?:)?\/\//i.test(src)) return false;
    if (/^(data:|blob:|file:)/i.test(src)) return false;
    if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) return false;
    if (src.startsWith(IMAGE_DIR)) return false;
    if (src.includes('/')) return false;

    return true;
  }

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(value) {
      const fixed = shouldPrefix(value) ? IMAGE_DIR + value : value;
      return desc.set.call(this, fixed);
    },
  });
})();
