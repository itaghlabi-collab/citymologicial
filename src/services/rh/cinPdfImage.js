/**
 * cinPdfImage.js — Recadrage visuel CIN pour le PDF uniquement.
 * N'affecte ni Storage, ni OCR, ni les fichiers originaux.
 */

/** Ratio officiel CIN marocaine : 85,60 × 53,98 mm */
export const CIN_RATIO = 85.60 / 53.98;

const RATIO_TOLERANCE = 0.12;
const PDF_MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.92;

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Chargement image CIN impossible'));
    img.src = src;
  });
}

function colorDist(r, g, b, bg) {
  return Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
}

function sampleCornerBg(data, w, h) {
  const pts = [
    [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
    [Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3],
  ];
  let r = 0; let g = 0; let b = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  const n = pts.length;
  return { r: r / n, g: g / n, b: b / n };
}

/** Détecte la zone non-fond (carte) dans l'image capturée. */
function detectContentRect(imageData, w, h) {
  const { data } = imageData;
  const bg = sampleCornerBg(data, w, h);
  const threshold = 38;
  const step = Math.max(2, Math.floor(Math.min(w, h) / 200));

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (colorDist(data[i], data[i + 1], data[i + 2], bg) > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  if (hits < 8 || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w, h };
  }

  const padX = Math.round((maxX - minX) * 0.02);
  const padY = Math.round((maxY - minY) * 0.02);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX);
  maxY = Math.min(h - 1, maxY + padY);

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Calcule le plus grand rectangle au ratio CIN centré sur la zone détectée.
 */
function computeCropRect(imgW, imgH, content) {
  const cx = content.x + content.w / 2;
  const cy = content.y + content.h / 2;
  const imgRatio = imgW / imgH;
  const contentRatio = content.w / content.h;

  let cropW;
  let cropH;

  if (Math.abs(contentRatio - CIN_RATIO) <= RATIO_TOLERANCE) {
    cropW = content.w;
    cropH = content.h;
  } else if (contentRatio > CIN_RATIO) {
    cropH = content.h;
    cropW = cropH * CIN_RATIO;
  } else {
    cropW = content.w;
    cropH = cropW / CIN_RATIO;
  }

  if (cropW > imgW) {
    cropW = imgW;
    cropH = cropW / CIN_RATIO;
  }
  if (cropH > imgH) {
    cropH = imgH;
    cropW = cropH * CIN_RATIO;
  }

  if (Math.abs(imgRatio - CIN_RATIO) <= RATIO_TOLERANCE && content.w >= imgW * 0.85) {
    cropW = imgW;
    cropH = imgH;
  }

  let x = Math.round(cx - cropW / 2);
  let y = Math.round(cy - cropH / 2);

  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + cropW > imgW) x = imgW - cropW;
  if (y + cropH > imgH) y = imgH - cropH;

  cropW = Math.max(1, Math.round(cropW));
  cropH = Math.max(1, Math.round(cropH));

  return { x, y, w: cropW, h: cropH };
}

function drawToCanvas(img) {
  const scale = Math.min(1, PDF_MAX_WIDTH / Math.max(img.width, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

/**
 * Prépare une image CIN recadrée pour le PDF (dataURL JPEG).
 * @param {string} imageUrl — dataURL ou URL HTTP(S)
 * @param {'recto'|'verso'} [_side] — réservé pour affinage futur
 * @returns {Promise<string|null>}
 */
export async function prepareCinImageForPdf(imageUrl, _side = 'recto') {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  try {
    const img = await loadHtmlImage(imageUrl);
    const { canvas, ctx, w, h } = drawToCanvas(img);
    const imageData = ctx.getImageData(0, 0, w, h);
    const content = detectContentRect(imageData, w, h);
    const crop = computeCropRect(w, h, content);

    const outW = Math.min(PDF_MAX_WIDTH, Math.max(1, Math.round(crop.w)));
    const outH = Math.max(1, Math.round(outW / CIN_RATIO));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outW, outH);
    octx.drawImage(
      canvas,
      crop.x, crop.y, crop.w, crop.h,
      0, 0, outW, outH,
    );

    return out.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch (err) {
    console.warn('[PDF CIN] recadrage ignoré, image originale', err?.message || err);
    return imageUrl;
  }
}
