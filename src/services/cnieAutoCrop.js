/**
 * Recadrage automatique CNIE (client) — détection contours + normalisation ID-1.
 * Aucune donnée personnelle loggée.
 */
const ID1_RATIO = 85.6 / 53.98; // ≈ 1.586
const LOG = (...args) => console.info('[CIN CROP]', ...args);

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image non lisible'));
    img.src = dataUrl;
  });
}

function toCanvas(img, maxSide = 1600) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
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

function orderQuad(pts) {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);
  return [
    pts[sum.indexOf(Math.min(...sum))],
    pts[diff.indexOf(Math.min(...diff))],
    pts[sum.indexOf(Math.max(...sum))],
    pts[diff.indexOf(Math.max(...diff))],
  ];
}

/**
 * Détection grossière du rectangle carte (luminosité + densité centrale).
 * @returns {{x,y,w,h}|null}
 */
function detectCardRect(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);
  const step = Math.max(2, Math.floor(Math.min(W, H) / 220));

  // Histogramme luminosité pour seuil adaptatif
  const hist = new Array(256).fill(0);
  let n = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[g] += 1;
      n += 1;
    }
  }
  let acc = 0;
  let thr = 110;
  for (let g = 255; g >= 40; g -= 1) {
    acc += hist[g];
    if (acc / n > 0.35) {
      thr = Math.max(55, g - 15);
      break;
    }
  }

  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  const cx0 = W * 0.08;
  const cx1 = W * 0.92;
  const cy0 = H * 0.08;
  const cy1 = H * 0.92;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (x < cx0 || x > cx1 || y < cy0 || y > cy1) continue;
      const i = (y * W + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (g >= thr && g < 250) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  const area = bw * bh;
  const imgArea = W * H;
  if (count < 50 || area < imgArea * 0.12 || area > imgArea * 0.96) {
    return null;
  }
  const ratio = bw / Math.max(1, bh);
  if (ratio < 1.15 || ratio > 2.4) {
    // encore plausible pour carte tournée / partiellement vue
    if (ratio < 0.7 || ratio > 2.8) return null;
  }

  // Marge de sécurité ~2.5 %
  const mx = Math.max(0, Math.floor(minX - W * 0.025));
  const my = Math.max(0, Math.floor(minY - H * 0.025));
  const Mw = Math.min(W - mx, Math.ceil(bw + W * 0.05));
  const Mh = Math.min(H - my, Math.ceil(bh + H * 0.05));
  if (Mw < 120 || Mh < 70) return null;
  return { x: mx, y: my, w: Mw, h: Mh };
}

/** Crop AABB + canvas ID-1 (contain, sans étirement). */
function cropAndNormalize(src, rect) {
  const crop = document.createElement('canvas');
  crop.width = rect.w;
  crop.height = rect.h;
  crop.getContext('2d').drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  const targetW = Math.min(1600, Math.max(640, rect.w));
  const targetH = Math.round(targetW / ID1_RATIO);
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);

  const scale = Math.min(targetW / rect.w, targetH / rect.h);
  const dw = Math.round(rect.w * scale);
  const dh = Math.round(rect.h * scale);
  const dx = Math.round((targetW - dw) / 2);
  const dy = Math.round((targetH - dh) / 2);
  ctx.drawImage(crop, 0, 0, rect.w, rect.h, dx, dy, dw, dh);
  return out;
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ dataUrl: string, cropped: boolean, message: string|null }>}
 */
export async function autoCropCnieImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { dataUrl, cropped: false, message: 'Recadrage automatique impossible, vérifiez la photo' };
  }
  try {
    const img = await loadImage(dataUrl);
    const base = toCanvas(img);
    const rect = detectCardRect(base);
    if (!rect) {
      LOG('detect miss — keep original', { w: base.width, h: base.height });
      return {
        dataUrl,
        cropped: false,
        message: 'Recadrage automatique impossible, vérifiez la photo',
      };
    }
    const out = cropAndNormalize(base, rect);
    const croppedUrl = out.toDataURL('image/jpeg', 0.9);
    LOG('detect ok', { src: `${base.width}x${base.height}`, crop: `${rect.w}x${rect.h}`, out: `${out.width}x${out.height}` });
    return { dataUrl: croppedUrl, cropped: true, message: null };
  } catch (_) {
    return {
      dataUrl,
      cropped: false,
      message: 'Recadrage automatique impossible, vérifiez la photo',
    };
  }
}

export { ID1_RATIO, orderQuad };
