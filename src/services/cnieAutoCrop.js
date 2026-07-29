/**
 * Recadrage automatique CNIE (client) — détection carte vs fond + normalisation ID-1.
 *
 * Principe fondamental : NE JAMAIS couper la carte.
 *   → marge de sécurité systématique (5 %)
 *   → en cas de doute, garder l'image originale
 */
const ID1_RATIO = 85.6 / 53.98; // ≈ 1.586
const SAFETY_MARGIN = 0.05;
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

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isBackgroundPixel(r, g, b) {
  const L = lum(r, g, b);
  if (L < 48) return true;
  if (r > 45 && r >= g && g >= b - 8 && (r - b) > 18 && L < 155) return true;
  if (L < 70 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) return true;
  return false;
}

function isCardPixel(r, g, b) {
  if (isBackgroundPixel(r, g, b)) return false;
  const L = lum(r, g, b);
  if (L < 55) return false;
  if (b > r + 15 && b > 80 && L > 60) return true;
  if (L > 90 && r > 100 && g > 90 && b > 70) return true;
  if (L > 120) return true;
  if (r > g && g > b && L > 70 && L < 210) return true;
  return L > 85;
}

/**
 * Expand rect with safety margin — never shrink.
 * Ensures we never cut into the card.
 */
function expandWithSafety(rect, W, H, margin = SAFETY_MARGIN) {
  if (!rect) return null;
  const mx = Math.round(W * margin);
  const my = Math.round(H * margin);
  const x = Math.max(0, rect.x - mx);
  const y = Math.max(0, rect.y - my);
  const x2 = Math.min(W, rect.x + rect.w + mx);
  const y2 = Math.min(H, rect.y + rect.h + my);
  const w = x2 - x;
  const h = y2 - y;
  if (w < 100 || h < 60) return null;
  return { x, y, w, h };
}

function scoreRect(rect, W, H) {
  if (!rect) return -1;
  const area = rect.w * rect.h;
  const cover = area / (W * H);
  if (cover < 0.08 || cover > 0.95) return -1;
  const ratio = rect.w / Math.max(1, rect.h);
  const r = ratio >= 1 ? ratio : 1 / ratio;
  const ratioScore = 1 - Math.min(1, Math.abs(r - ID1_RATIO) / 0.9);
  const coverScore = cover >= 0.15 && cover <= 0.75 ? 1 : cover < 0.15 ? cover / 0.15 : Math.max(0, 1 - (cover - 0.75) / 0.2);
  return ratioScore * 0.55 + coverScore * 0.45;
}

function detectByForeground(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);
  const step = Math.max(2, Math.floor(Math.min(W, H) / 240));

  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      if (!isCardPixel(data[i], data[i + 1], data[i + 2])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  if (count < 40) return null;
  return expandWithSafety({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, W, H);
}

function detectById1Window(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const sw = Math.min(320, W);
  const sh = Math.round((H * sw) / W);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);

  const scaleX = W / sw;
  const scaleY = H / sh;
  let best = null;
  let bestScore = 0;

  const widths = [0.92, 0.82, 0.72, 0.62, 0.52, 0.42].map((f) => Math.round(sw * f));
  for (const ww of widths) {
    const hh = Math.round(ww / ID1_RATIO);
    if (hh < 24 || hh > sh * 0.95) continue;
    const stepX = Math.max(4, Math.floor(ww / 10));
    const stepY = Math.max(4, Math.floor(hh / 10));
    for (let y = 0; y <= sh - hh; y += stepY) {
      for (let x = 0; x <= sw - ww; x += stepX) {
        let inSum = 0, inN = 0, outSum = 0, outN = 0, cardN = 0;
        const sample = 3;
        for (let yy = y; yy < y + hh; yy += sample) {
          for (let xx = x; xx < x + ww; xx += sample) {
            const i = (yy * sw + xx) * 4;
            const L = lum(data[i], data[i + 1], data[i + 2]);
            inSum += L;
            inN += 1;
            if (isCardPixel(data[i], data[i + 1], data[i + 2])) cardN += 1;
          }
        }
        const pad = Math.max(4, Math.floor(Math.min(ww, hh) * 0.08));
        const x0 = Math.max(0, x - pad);
        const y0 = Math.max(0, y - pad);
        const x1 = Math.min(sw, x + ww + pad);
        const y1 = Math.min(sh, y + hh + pad);
        for (let yy = y0; yy < y1; yy += sample) {
          for (let xx = x0; xx < x1; xx += sample) {
            if (xx >= x && xx < x + ww && yy >= y && yy < y + hh) continue;
            const i = (yy * sw + xx) * 4;
            outSum += lum(data[i], data[i + 1], data[i + 2]);
            outN += 1;
          }
        }
        if (!inN || !outN) continue;
        const inMean = inSum / inN;
        const outMean = outSum / outN;
        const cardRatio = cardN / inN;
        const contrast = inMean - outMean;
        if (contrast < 12 && cardRatio < 0.35) continue;
        const score = contrast * 0.5 + cardRatio * 80 + (inMean > 90 ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = {
            x: Math.round(x * scaleX),
            y: Math.round(y * scaleY),
            w: Math.round(ww * scaleX),
            h: Math.round(hh * scaleY),
          };
        }
      }
    }
  }

  if (!best || bestScore < 25) return null;
  return expandWithSafety(best, W, H, SAFETY_MARGIN * 0.8);
}

function detectByBrightness(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);
  const step = Math.max(2, Math.floor(Math.min(W, H) / 220));
  const hist = new Array(256).fill(0);
  let n = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      hist[Math.round(lum(data[i], data[i + 1], data[i + 2]))] += 1;
      n += 1;
    }
  }
  let acc = 0, thr = 110;
  for (let g = 255; g >= 40; g -= 1) {
    acc += hist[g];
    if (acc / n > 0.28) { thr = Math.max(60, g - 10); break; }
  }
  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
  for (let y = Math.floor(H * 0.05); y < H * 0.95; y += step) {
    for (let x = Math.floor(W * 0.05); x < W * 0.95; x += step) {
      const i = (y * W + x) * 4;
      const L = lum(data[i], data[i + 1], data[i + 2]);
      if (L >= thr && L < 252 && !isBackgroundPixel(data[i], data[i + 1], data[i + 2])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  if (count < 50) return null;
  return expandWithSafety({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, W, H);
}

function detectCardRect(canvas) {
  const { width: W, height: H } = canvas;
  const candidates = [
    detectByForeground(canvas),
    detectById1Window(canvas),
    detectByBrightness(canvas),
  ].filter(Boolean);

  if (!candidates.length) return null;

  let best = candidates[0];
  let bestScore = scoreRect(best, W, H);
  for (let i = 1; i < candidates.length; i += 1) {
    const s = scoreRect(candidates[i], W, H);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return bestScore >= 0.2 ? best : null;
}

/**
 * Crop + fit into ID-1 canvas (contain mode, no stretching).
 * The crop already has safety margins so the entire card is preserved.
 */
function cropAndNormalize(src, rect) {
  const crop = document.createElement('canvas');
  crop.width = rect.w;
  crop.height = rect.h;
  crop.getContext('2d').drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  // Sortie ID-1 stricte — remplir le cadre (cover), sans bandes grises
  let targetW = Math.min(1400, Math.max(900, rect.w));
  let targetH = Math.round(targetW / ID1_RATIO);
  if (targetH > 900) {
    targetH = 900;
    targetW = Math.round(targetH * ID1_RATIO);
  }

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#e8e8ea';
  ctx.fillRect(0, 0, targetW, targetH);

  const scale = Math.max(targetW / rect.w, targetH / rect.h);
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
      return { dataUrl, cropped: false, message: 'Recadrage automatique impossible, vérifiez la photo' };
    }
    const cover = (rect.w * rect.h) / (base.width * base.height);
    if (cover > 0.92) {
      LOG('crop ≈ full image — keep original', { cover: Number(cover.toFixed(2)) });
      return { dataUrl, cropped: false, message: null };
    }
    const out = cropAndNormalize(base, rect);
    const croppedUrl = out.toDataURL('image/jpeg', 0.92);
    LOG('crop ok', {
      src: `${base.width}x${base.height}`,
      crop: `${rect.w}x${rect.h}`,
      cover: Number(cover.toFixed(2)),
      out: `${out.width}x${out.height}`,
    });
    return { dataUrl: croppedUrl, cropped: true, message: null };
  } catch (_) {
    return { dataUrl, cropped: false, message: 'Recadrage automatique impossible, vérifiez la photo' };
  }
}

export { ID1_RATIO, orderQuad };
