/**
 * cinCapture.js — Recadrage CIN selon le cadre rouge du scanner (viewport → vidéo)
 * Ratio officielle ID-1 : 85,60 × 53,98 mm
 */

export const CIN_ASPECT_RATIO = 85.60 / 53.98;

/** Aligné sur SVG mask + .cin-vf-frame (viewBox %) — recto (zone noms) */
export const CIN_FRAME_MASK = { x: 0.09, y: 0.2415, w: 0.82, h: 0.517 };

/** Verso : carte quasi entière (adresse haut + MRZ bas) */
export const CIN_VERSO_MASK = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

/** @deprecated alias — même zone que le cadre rouge */
export const CIN_CROP = CIN_FRAME_MASK;

export function getCinFrameMaskForSide(side) {
  return side === 'verso' ? CIN_VERSO_MASK : CIN_FRAME_MASK;
}

const DEFAULT_MARGIN = 0.03;

export function dataUrlToCaptureFile(dataUrl, side, suffix = '') {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const tag = suffix ? `-${suffix}` : '';
  return new File([bytes], `cin-${side}${tag}.jpg`, { type: mime });
}

export function computeCoverTransform(displayW, displayH, videoW, videoH) {
  const scale = Math.max(displayW / videoW, displayH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  return {
    scale,
    offsetX: (displayW - dispW) / 2,
    offsetY: (displayH - dispH) / 2,
    dispW,
    dispH,
  };
}

/**
 * Convertit le rectangle du cadre rouge (viewport) en coordonnées pixels vidéo (object-fit: cover).
 * @returns {{ x, y, w, h, videoW, videoH, frameRect, videoRect, cover }}
 */
export function mapFrameRectToVideoCrop(videoEl, frameEl, options = {}) {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const videoW = videoEl.videoWidth || 0;
  const videoH = videoEl.videoHeight || 0;
  if (!videoW || !videoH) {
    throw new Error('Vidéo non prête pour le recadrage.');
  }

  const videoRect = videoEl.getBoundingClientRect();
  const frameRect = frameEl.getBoundingClientRect();
  const displayW = videoRect.width;
  const displayH = videoRect.height;
  const { scale, offsetX, offsetY } = computeCoverTransform(displayW, displayH, videoW, videoH);

  let relLeft = frameRect.left - videoRect.left;
  let relTop = frameRect.top - videoRect.top;
  let relW = frameRect.width;
  let relH = frameRect.height;

  relLeft -= relW * margin;
  relTop -= relH * margin;
  relW *= 1 + 2 * margin;
  relH *= 1 + 2 * margin;

  relLeft = Math.max(0, relLeft);
  relTop = Math.max(0, relTop);
  relW = Math.min(displayW - relLeft, relW);
  relH = Math.min(displayH - relTop, relH);

  let cropX = (relLeft - offsetX) / scale;
  let cropY = (relTop - offsetY) / scale;
  let cropW = relW / scale;
  let cropH = relH / scale;

  cropX = Math.max(0, Math.min(videoW - 1, cropX));
  cropY = Math.max(0, Math.min(videoH - 1, cropY));
  cropW = Math.max(1, Math.min(videoW - cropX, cropW));
  cropH = Math.max(1, Math.min(videoH - cropY, cropH));

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    w: Math.round(cropW),
    h: Math.round(cropH),
    videoW,
    videoH,
    frameRect: {
      left: frameRect.left,
      top: frameRect.top,
      width: frameRect.width,
      height: frameRect.height,
    },
    videoRect: { width: displayW, height: displayH },
    cover: { scale, offsetX, offsetY },
  };
}

/** Recadrage image importée (galerie) selon les mêmes ratios que le masque. */
export function cropImageDataUrlByMask(dataUrl, ratios = CIN_FRAME_MASK, margin = DEFAULT_MARGIN) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.width;
        const H = img.height;
        let x = W * ratios.x - W * ratios.w * margin;
        let y = H * ratios.y - H * ratios.h * margin;
        let w = W * ratios.w * (1 + 2 * margin);
        let h = H * ratios.h * (1 + 2 * margin);
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = Math.min(W - x, w);
        h = Math.min(H - y, h);
        const cw = Math.max(1, Math.round(w));
        const ch = Math.max(1, Math.round(h));
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, x, y, w, h, 0, 0, cw, ch);
        resolve({
          croppedDataUrl: c.toDataURL('image/jpeg', 0.92),
          crop: { x: Math.round(x), y: Math.round(y), w: cw, h: ch, videoW: W, videoH: H },
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Image non chargeable.'));
    img.src = dataUrl;
  });
}

export function drawVideoCrop(video, crop, quality = 0.92) {
  const c = document.createElement('canvas');
  c.width = crop.w;
  c.height = crop.h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, crop.w, crop.h);
  ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', quality) };
}

/**
 * Capture scanner : fichier plein cadre pour OCR + preview/fiche cropée.
 */
export async function captureCINFromVideo(video, frameEl, side, options = {}) {
  const crop = mapFrameRectToVideoCrop(video, frameEl, options);

  console.info('[SCAN CIN] frame rect', crop.frameRect);
  console.info('[SCAN CIN] video size', { width: crop.videoW, height: crop.videoH });
  console.info('[SCAN CIN] crop coordinates', {
    x: crop.x, y: crop.y, w: crop.w, h: crop.h,
    ratio: (crop.w / crop.h).toFixed(3),
    targetRatio: CIN_ASPECT_RATIO.toFixed(3),
  });

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = crop.videoW;
  fullCanvas.height = crop.videoH;
  fullCanvas.getContext('2d').drawImage(video, 0, 0);
  const fullDataUrl = fullCanvas.toDataURL('image/jpeg', 0.98);

  const { dataUrl: croppedDataUrl } = drawVideoCrop(video, crop);
  const ocrFile = dataUrlToCaptureFile(fullDataUrl, side, 'ocr');
  const displayFile = dataUrlToCaptureFile(croppedDataUrl, side);

  console.info('[SCAN CIN] cropped file created', {
    side,
    cropW: crop.w,
    cropH: crop.h,
    ocrBytes: ocrFile.size,
    displayBytes: displayFile.size,
  });

  return {
    previewDataUrl: croppedDataUrl,
    fullDataUrl,
    ocrFile,
    displayFile,
    crop,
  };
}

/** Galerie : aperçu recadré (par côté) + image pleine résolution pour OCR. */
export async function prepareImportedCINImage(dataUrl, file, side) {
  const mask = getCinFrameMaskForSide(side);
  const { croppedDataUrl, crop } = await cropImageDataUrlByMask(dataUrl, mask);
  console.info('[SCAN CIN] crop coordinates (import)', { side, ...crop });

  const fullDataUrl = dataUrl;
  const ocrFile = (file instanceof File && file.size > 0)
    ? file
    : dataUrlToCaptureFile(fullDataUrl, side, 'ocr-full');

  console.info('[SCAN CIN] OCR uses full image', {
    side,
    ocrBytes: ocrFile.size,
    previewCrop: mask === CIN_VERSO_MASK ? 'verso-full' : 'recto-frame',
  });

  return {
    previewDataUrl: croppedDataUrl,
    fullDataUrl,
    ocrFile,
    displayFile: dataUrlToCaptureFile(croppedDataUrl, side),
  };
}
