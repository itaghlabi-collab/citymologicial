/**
 * Prétraitement canvas côté client (secours sans OpenCV natif).
 * - Détection grossière du cadre carte (contour luminosité)
 * - Warp perspective si quad trouvé
 * - Amélioration contraste / netteté par zone
 */
const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image non lisible'));
    img.src = dataUrl;
  });
}

function canvasFromImage(img, maxSide = 1800) {
  let { width: w, height: h } = img;
  const max = Math.max(w, h);
  if (max > maxSide) {
    const s = maxSide / max;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function orderPoints(pts) {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);
  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.min(...diff))];
  const bl = pts[diff.indexOf(Math.max(...diff))];
  return [tl, tr, br, bl];
}

/** Détection simple d'un rectangle carte via seuillage + bounding box élargi. */
function findCardQuad(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  // Downsample for speed
  const step = Math.max(2, Math.floor(Math.min(w, h) / 200));
  let minX = w; let minY = h; let maxX = 0; let maxY = 0;
  let count = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Carte claire sur fond plus sombre (approx)
      if (g > 70 && g < 245) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  const area = (maxX - minX) * (maxY - minY);
  const imgArea = w * h;
  if (count < 40 || area < imgArea * 0.2 || area > imgArea * 0.98) {
    return null;
  }
  // Marges
  const mx = Math.max(0, minX - w * 0.01);
  const my = Math.max(0, minY - h * 0.01);
  const Mx = Math.min(w - 1, maxX + w * 0.01);
  const My = Math.min(h - 1, maxY + h * 0.01);
  return orderPoints([
    { x: mx, y: my },
    { x: Mx, y: my },
    { x: Mx, y: My },
    { x: mx, y: My },
  ]);
}

/**
 * Warp perspective via transform canvas (approx pour rectangle axis-aligned).
 * Pour un vrai quad non aligné, on utilise un crop AABB (simple, fiable).
 */
function warpOrCrop(srcCanvas, quad) {
  if (!quad) return srcCanvas;
  const [tl, tr, br, bl] = quad;
  const width = Math.max(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - bl.x, br.y - bl.y),
  );
  const height = Math.max(
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
    Math.hypot(br.x - tr.x, br.y - tr.y),
  );
  const outW = Math.max(400, Math.round(width));
  const outH = Math.max(250, Math.round(height));

  // Si presque rectangle aligné → crop AABB
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x1 = Math.max(0, Math.floor(Math.min(...xs)));
  const y1 = Math.max(0, Math.floor(Math.min(...ys)));
  const x2 = Math.min(srcCanvas.width, Math.ceil(Math.max(...xs)));
  const y2 = Math.min(srcCanvas.height, Math.ceil(Math.max(...ys)));
  const cw = x2 - x1;
  const ch = y2 - y1;
  if (cw < 80 || ch < 50) return srcCanvas;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  ctx.drawImage(srcCanvas, x1, y1, cw, ch, 0, 0, outW, outH);
  return out;
}

function enhanceCanvas(src, mode = 'color') {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Contraste + luminosité
  const contrast = mode === 'digits' ? 1.55 : 1.35;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * contrast + intercept;
    let g = d[i + 1] * contrast + intercept;
    let b = d[i + 2] * contrast + intercept;
    if (mode === 'digits' || mode === 'mrz') {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const bin = gray > 140 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bin;
    } else {
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Prépare la carte redressée à partir d'une data URL.
 * @returns {Promise<{ canvas: HTMLCanvasElement, warped: boolean, dataUrl: string }>}
 */
export async function prepareCardCanvas(dataUrl) {
  const img = await loadImage(dataUrl);
  const base = canvasFromImage(img);
  const quad = findCardQuad(base);
  const card = warpOrCrop(base, quad);
  const enhanced = enhanceCanvas(card, 'color');
  LOG('prepareCardCanvas', {
    warped: !!quad,
    size: `${enhanced.width}x${enhanced.height}`,
  });
  return {
    canvas: enhanced,
    warped: !!quad,
    dataUrl: enhanced.toDataURL('image/jpeg', 0.92),
  };
}

/**
 * Crop relatif d'une zone + amélioration.
 * @returns {string} data URL JPEG
 */
export function cropZoneDataUrl(cardCanvas, zone) {
  const { width: W, height: H } = cardCanvas;
  const pad = zone.pad || 0.012;
  const x1 = Math.max(0, Math.floor((zone.x - pad) * W));
  const y1 = Math.max(0, Math.floor((zone.y - pad) * H));
  const x2 = Math.min(W, Math.ceil((zone.x + zone.w + pad) * W));
  const y2 = Math.min(H, Math.ceil((zone.y + zone.h + pad) * H));
  let cw = Math.max(8, x2 - x1);
  let ch = Math.max(8, y2 - y1);

  const crop = document.createElement('canvas');
  crop.width = cw;
  crop.height = ch;
  crop.getContext('2d').drawImage(cardCanvas, x1, y1, cw, ch, 0, 0, cw, ch);

  const minH = zone.minHeight || 48;
  let out = crop;
  if (ch < minH) {
    const scale = minH / ch;
    const up = document.createElement('canvas');
    up.width = Math.round(cw * scale);
    up.height = minH;
    up.getContext('2d').drawImage(crop, 0, 0, up.width, up.height);
    out = up;
  }

  const mode = zone.lang === 'digits' || zone.lang === 'mrz' ? 'digits' : 'color';
  const enhanced = enhanceCanvas(out, mode);
  return enhanced.toDataURL('image/jpeg', 0.95);
}
