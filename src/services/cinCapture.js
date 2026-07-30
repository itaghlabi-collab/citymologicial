/**
 * cinCapture.js — Recadrage CIN selon le cadre guide du scanner (viewport → vidéo)
 * Ratio officiel ID-1 : 85,60 × 53,98 mm
 *
 * Règle : l’image d’aperçu = l’image envoyée à l’OCR (même data URL / fichier).
 */

export const CIN_ASPECT_RATIO = 85.60 / 53.98;

/** Aligné sur SVG mask + .cin-vf-frame (viewBox %) — recto */
export const CIN_FRAME_MASK = { x: 0.06, y: 0.2225, w: 0.88, h: 0.555 };

/** Verso : carte quasi entière */
export const CIN_VERSO_MASK = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

/** @deprecated alias */
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
    mode: 'cover',
    scale,
    offsetX: (displayW - dispW) / 2,
    offsetY: (displayH - dispH) / 2,
    dispW,
    dispH,
  };
}

export function computeContainTransform(displayW, displayH, videoW, videoH) {
  const scale = Math.min(displayW / videoW, displayH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  return {
    mode: 'contain',
    scale,
    offsetX: (displayW - dispW) / 2,
    offsetY: (displayH - dispH) / 2,
    dispW,
    dispH,
  };
}

/**
 * Détecte object-fit réel du <video> (cover / contain / fill) et renvoie le mapping CSS → pixels.
 */
export function computeVideoDisplayTransform(videoEl) {
  const videoW = videoEl.videoWidth || 0;
  const videoH = videoEl.videoHeight || 0;
  const videoRect = videoEl.getBoundingClientRect();
  const displayW = videoRect.width;
  const displayH = videoRect.height;
  if (!videoW || !videoH || !displayW || !displayH) {
    throw new Error('Vidéo non prête pour le mapping.');
  }
  const fit = (typeof window !== 'undefined' && window.getComputedStyle)
    ? (window.getComputedStyle(videoEl).objectFit || 'cover')
    : 'cover';
  const transform = fit === 'contain'
    ? computeContainTransform(displayW, displayH, videoW, videoH)
    : fit === 'fill'
      ? { mode: 'fill', scaleX: displayW / videoW, scaleY: displayH / videoH, offsetX: 0, offsetY: 0, dispW: displayW, dispH: displayH }
      : computeCoverTransform(displayW, displayH, videoW, videoH);
  return { ...transform, videoW, videoH, displayW, displayH, videoRect, objectFit: fit };
}

/**
 * Convertit le rectangle du cadre guide (viewport) en coordonnées pixels vidéo.
 * Respecte object-fit cover/contain + offsets. Marge = expansion autour du guide visible.
 * @param {number} [options.margin=0.04] — 4 % de marge sécurité de chaque côté
 */
export function mapFrameRectToVideoCrop(videoEl, frameEl, options = {}) {
  const margin = options.margin ?? 0.04;
  const mapped = computeVideoDisplayTransform(videoEl);
  const { videoW, videoH, displayW, displayH, videoRect } = mapped;
  const frameRect = frameEl.getBoundingClientRect();

  let relLeft = frameRect.left - videoRect.left;
  let relTop = frameRect.top - videoRect.top;
  let relW = frameRect.width;
  let relH = frameRect.height;

  // Marge de sécurité : zone capturée légèrement plus large que le guide visible
  relLeft -= relW * margin;
  relTop -= relH * margin;
  relW *= 1 + 2 * margin;
  relH *= 1 + 2 * margin;

  relLeft = Math.max(0, relLeft);
  relTop = Math.max(0, relTop);
  relW = Math.min(displayW - relLeft, relW);
  relH = Math.min(displayH - relTop, relH);

  let cropX;
  let cropY;
  let cropW;
  let cropH;

  if (mapped.mode === 'fill') {
    cropX = relLeft / mapped.scaleX;
    cropY = relTop / mapped.scaleY;
    cropW = relW / mapped.scaleX;
    cropH = relH / mapped.scaleY;
  } else {
    const { scale, offsetX, offsetY } = mapped;
    cropX = (relLeft - offsetX) / scale;
    cropY = (relTop - offsetY) / scale;
    cropW = relW / scale;
    cropH = relH / scale;
  }

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
    margin,
    frameRect: {
      left: frameRect.left,
      top: frameRect.top,
      width: frameRect.width,
      height: frameRect.height,
    },
    videoRect: { width: displayW, height: displayH },
    transform: mapped,
  };
}

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
        ctx.fillStyle = '#f3f4f6';
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
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, crop.w, crop.h);
  ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', quality) };
}

/**
 * Fit un dataURL dans un canvas ID-1 en mode contain (bandes neutres si besoin).
 */
export async function fitDataUrlToId1Contain(dataUrl, quality = 0.92) {
  const { ID1_RATIO } = await import('./cnieAutoCrop');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let targetW = Math.min(1400, Math.max(900, img.width));
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
        const scale = Math.min(targetW / img.width, targetH / img.height);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(img.height * scale);
        const dx = Math.round((targetW - dw) / 2);
        const dy = Math.round((targetH - dh) / 2);
        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
        resolve(out.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Image non chargeable.'));
    img.src = dataUrl;
  });
}

/**
 * Capture guidée : uniquement la zone du cadre (+ marge), sans auto-crop ultérieur.
 * Une seule image = aperçu = OCR (finalImageFile).
 */
export async function captureGuidedCINFrame(video, frameEl, side, options = {}) {
  const margin = options.margin ?? 0.04;
  const crop = mapFrameRectToVideoCrop(video, frameEl, { margin });
  const { dataUrl } = drawVideoCrop(video, crop, 0.95);

  // Normaliser en canvas ID-1 contain (pas de zoom cover)
  const finalImageDataUrl = await fitDataUrlToId1Contain(dataUrl, 0.92);
  const finalImageFile = dataUrlToCaptureFile(finalImageDataUrl, side, 'guided-frame');

  console.info('[SCAN CIN] guided frame capture', {
    side,
    crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h },
    ratio: (crop.w / Math.max(1, crop.h)).toFixed(3),
    target: CIN_ASPECT_RATIO.toFixed(3),
    margin,
    objectFit: crop.transform?.objectFit,
    bytes: finalImageFile.size,
  });

  return {
    previewDataUrl: finalImageDataUrl,
    fullDataUrl: finalImageDataUrl,
    finalImageDataUrl,
    finalImageFile,
    ocrFile: finalImageFile,
    displayFile: finalImageFile,
    originalDataUrl: finalImageDataUrl,
    detected: false, // pas de faux positif « carte détectée »
    cropFailed: false,
    cropMessage: null,
    guided: true,
    crop,
  };
}

/**
 * Capture scanner legacy : cadre guide → une seule image pour aperçu + OCR.
 * Préfère désormais le crop exact du cadre (sans auto-crop agressif).
 */
export async function captureCINFromVideo(video, frameEl, side, options = {}) {
  return captureGuidedCINFrame(video, frameEl, side, options);
}

/**
 * Galerie / import : recadrage auto prudent.
 * Aperçu === fichier OCR (même bytes).
 */
export async function prepareImportedCINImage(dataUrl, file, side) {
  const { autoCropCnieImage } = await import('./cnieAutoCrop');
  const cropped = await autoCropCnieImage(dataUrl);
  const useUrl = (cropped.detected && cropped.dataUrl) ? cropped.dataUrl : dataUrl;

  console.info('[SCAN CIN] import crop', {
    side,
    cropped: cropped.cropped,
    detected: cropped.detected,
    status: cropped.status,
  });

  const ocrFile = dataUrlToCaptureFile(
    useUrl,
    side,
    cropped.detected ? 'ocr-cropped' : 'ocr-full',
  );

  return {
    previewDataUrl: useUrl,
    fullDataUrl: useUrl,
    originalDataUrl: dataUrl,
    ocrFile,
    displayFile: ocrFile,
    cropFailed: !cropped.detected,
    cropMessage: cropped.detected ? null : (cropped.message || 'Cadrage à vérifier'),
    detected: Boolean(cropped.detected),
    status: cropped.status || (cropped.detected ? 'ok' : 'uncertain'),
  };
}
