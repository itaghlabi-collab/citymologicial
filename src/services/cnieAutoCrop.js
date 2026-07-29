/**
 * Recadrage automatique CNIE (client) — détection prudente + normalisation ID-1.
 *
 * Règles :
 * - ne jamais zoomer (cover) sur une zone incertaine ;
 * - ne jamais traiter toute l’image comme une carte ;
 * - si la détection est douteuse → renvoyer l’original intact.
 */
const ID1_RATIO = 85.6 / 53.98; // ≈ 1.586
const SAFETY_MARGIN = 0.04;
/** Tolérance ratio autour d’ID-1 (ex. 1.15–2.0 après orientation). */
const RATIO_TOLERANCE = 0.38;
const MIN_COVER = 0.12;
const MAX_COVER = 0.78;
const MIN_SCORE = 0.55;
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
  // Reflets métalliques / clavier (gris saturé uniforme) — ne pas compter comme carte
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (L > 140 && chroma < 18) return false;
  if (b > r + 15 && b > 80 && L > 60) return true;
  if (L > 90 && r > 100 && g > 90 && b > 70 && chroma > 12) return true;
  if (L > 130 && chroma > 20) return true;
  if (r > g && g > b && L > 70 && L < 210) return true;
  return L > 95 && chroma > 15;
}

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
  if (w < 120 || h < 70) return null;
  return { x, y, w, h };
}

function rectCorners(rect) {
  return orderQuad([
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ]);
}

/**
 * Validation stricte : 4 coins, ratio proche ID-1, surface cohérente, carte non coupée.
 */
function validateCardGeometry(rect, W, H) {
  if (!rect) return { ok: false, reason: 'missing' };
  const cover = (rect.w * rect.h) / (W * H);
  if (cover < MIN_COVER || cover > MAX_COVER) {
    return { ok: false, reason: 'coverage', cover };
  }
  const ratio = rect.w / Math.max(1, rect.h);
  const r = ratio >= 1 ? ratio : 1 / ratio;
  if (Math.abs(r - ID1_RATIO) > RATIO_TOLERANCE) {
    return { ok: false, reason: 'ratio', ratio: r };
  }

  const edgeTol = Math.max(2, Math.round(Math.min(W, H) * 0.012));
  const touchesLeft = rect.x <= edgeTol;
  const touchesRight = rect.x + rect.w >= W - edgeTol;
  const touchesTop = rect.y <= edgeTol;
  const touchesBottom = rect.y + rect.h >= H - edgeTol;
  const edgeHits = [touchesLeft, touchesRight, touchesTop, touchesBottom].filter(Boolean).length;

  // Quasi plein cadre / carte coupée par les bords
  if (edgeHits >= 3) return { ok: false, reason: 'clipped', edgeHits };
  if ((touchesLeft && touchesRight) || (touchesTop && touchesBottom)) {
    return { ok: false, reason: 'edge-span', edgeHits };
  }

  const corners = rectCorners(rect);
  if (corners.length !== 4) return { ok: false, reason: 'corners' };

  return { ok: true, corners, ratio: r, cover };
}

function scoreRect(rect, W, H) {
  const geo = validateCardGeometry(rect, W, H);
  if (!geo.ok) return -1;
  const ratioScore = 1 - Math.min(1, Math.abs(geo.ratio - ID1_RATIO) / RATIO_TOLERANCE);
  const coverScore = geo.cover >= 0.18 && geo.cover <= 0.65
    ? 1
    : geo.cover < 0.18
      ? geo.cover / 0.18
      : Math.max(0, 1 - (geo.cover - 0.65) / 0.15);
  return ratioScore * 0.6 + coverScore * 0.4;
}

function detectByForeground(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);
  const step = Math.max(2, Math.floor(Math.min(W, H) / 240));

  let minX = W; let minY = H; let maxX = 0; let maxY = 0; let count = 0;

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

  if (count < 80) return null;
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

  const widths = [0.88, 0.78, 0.68, 0.58, 0.48].map((f) => Math.round(sw * f));
  for (const ww of widths) {
    const hh = Math.round(ww / ID1_RATIO);
    if (hh < 28 || hh > sh * 0.88) continue;
    const stepX = Math.max(4, Math.floor(ww / 9));
    const stepY = Math.max(4, Math.floor(hh / 9));
    for (let y = Math.round(sh * 0.04); y <= sh - hh - Math.round(sh * 0.04); y += stepY) {
      for (let x = Math.round(sw * 0.04); x <= sw - ww - Math.round(sw * 0.04); x += stepX) {
        let inSum = 0; let inN = 0; let outSum = 0; let outN = 0; let cardN = 0;
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
        const pad = Math.max(4, Math.floor(Math.min(ww, hh) * 0.1));
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
        // Clavier / bureau : contraste faible ou peu de pixels « carte »
        if (contrast < 22 || cardRatio < 0.42) continue;
        const score = contrast * 0.45 + cardRatio * 90 + (inMean > 95 ? 12 : 0);
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

  if (!best || bestScore < 48) return null;
  return expandWithSafety(best, W, H, SAFETY_MARGIN * 0.7);
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
  let acc = 0; let thr = 110;
  for (let g = 255; g >= 40; g -= 1) {
    acc += hist[g];
    if (acc / n > 0.28) { thr = Math.max(60, g - 10); break; }
  }
  let minX = W; let minY = H; let maxX = 0; let maxY = 0; let count = 0;
  for (let y = Math.floor(H * 0.06); y < H * 0.94; y += step) {
    for (let x = Math.floor(W * 0.06); x < W * 0.94; x += step) {
      const i = (y * W + x) * 4;
      const L = lum(data[i], data[i + 1], data[i + 2]);
      if (L >= thr && L < 252 && isCardPixel(data[i], data[i + 1], data[i + 2])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  if (count < 90) return null;
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

  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreRect(c, W, H);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  if (!best || bestScore < MIN_SCORE) return null;
  const geo = validateCardGeometry(best, W, H);
  if (!geo.ok) return null;
  return { rect: best, score: bestScore, geo };
}

/**
 * Crop + fit ID-1 en mode CONTAIN (jamais cover / zoom).
 */
function cropAndNormalizeContain(src, rect) {
  const crop = document.createElement('canvas');
  crop.width = rect.w;
  crop.height = rect.h;
  crop.getContext('2d').drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

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
  ctx.fillStyle = '#f3f4f6';
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
 * Normalise un crop libre (manuel) vers ID-1 contain.
 * @param {string} dataUrl
 * @param {{ x:number, y:number, w:number, h:number }} rect — coords image source
 */
export async function cropRectToId1Contain(dataUrl, rect) {
  const img = await loadImage(dataUrl);
  const base = toCanvas(img, 2400);
  const scaleX = base.width / (img.naturalWidth || img.width);
  const scaleY = base.height / (img.naturalHeight || img.height);
  const r = {
    x: Math.max(0, Math.round(rect.x * scaleX)),
    y: Math.max(0, Math.round(rect.y * scaleY)),
    w: Math.max(1, Math.round(rect.w * scaleX)),
    h: Math.max(1, Math.round(rect.h * scaleY)),
  };
  r.w = Math.min(r.w, base.width - r.x);
  r.h = Math.min(r.h, base.height - r.y);
  const out = cropAndNormalizeContain(base, r);
  return out.toDataURL('image/jpeg', 0.92);
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{
 *   dataUrl: string,
 *   cropped: boolean,
 *   detected: boolean,
 *   message: string|null,
 *   status: 'ok'|'uncertain'|'failed',
 * }>}
 */
export async function autoCropCnieImage(dataUrl) {
  const fail = (message) => ({
    dataUrl,
    cropped: false,
    detected: false,
    message: message || 'Cadrage à vérifier',
    status: 'uncertain',
  });

  if (!dataUrl || typeof dataUrl !== 'string') {
    return { ...fail('Recadrage automatique impossible, vérifiez la photo'), status: 'failed' };
  }
  try {
    const img = await loadImage(dataUrl);
    const base = toCanvas(img);
    const found = detectCardRect(base);
    if (!found) {
      LOG('detect miss — keep original', { w: base.width, h: base.height });
      return fail('Cadrage à vérifier');
    }
    const { rect, score, geo } = found;
    if (geo.cover > 0.88) {
      LOG('crop ≈ full image — keep original', { cover: Number(geo.cover.toFixed(2)) });
      return fail('Cadrage à vérifier');
    }
    const out = cropAndNormalizeContain(base, rect);
    const croppedUrl = out.toDataURL('image/jpeg', 0.92);
    LOG('crop ok', {
      src: `${base.width}x${base.height}`,
      crop: `${rect.w}x${rect.h}`,
      cover: Number(geo.cover.toFixed(2)),
      ratio: Number(geo.ratio.toFixed(3)),
      score: Number(score.toFixed(2)),
      out: `${out.width}x${out.height}`,
      mode: 'contain',
    });
    return {
      dataUrl: croppedUrl,
      cropped: true,
      detected: true,
      message: null,
      status: 'ok',
    };
  } catch (_) {
    return { ...fail('Recadrage automatique impossible, vérifiez la photo'), status: 'failed' };
  }
}

export { ID1_RATIO, orderQuad, validateCardGeometry };
