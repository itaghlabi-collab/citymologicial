/**
 * ocr.js — Client OCR CIN marocaine (backend CITYMO : OpenCV + PaddleOCR / Tesseract).
 * Aucun Mindee. OCR exécuté côté serveur uniquement.
 */
import { resolveApiBaseUrl } from '../config/env';

export function getOcrApiUrl() {
  return resolveApiBaseUrl();
}

export function isOcrDebugEnabled() {
  try {
    if (import.meta.env.VITE_OCR_DEBUG === 'true') return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('citymo_ocr_debug') === '1') return true;
  } catch (_) { /* ignore */ }
  return false;
}

function isImageDataUrl(s) {
  return typeof s === 'string' && /^data:image\//i.test(s);
}

function isMobileDevice() {
  try {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

export function canUseCamera() {
  try {
    return Boolean(navigator?.mediaDevices?.getUserMedia) && window.isSecureContext;
  } catch {
    return false;
  }
}

export function getCameraBlockedReason() {
  if (!window.isSecureContext) return 'HTTPS requis pour la caméra.';
  return 'Caméra non disponible sur cet appareil.';
}

export function getCameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') return 'Autorisation caméra refusée.';
  if (name === 'NotFoundError') return 'Aucune caméra détectée.';
  return err?.message || 'Impossible d\'activer la caméra.';
}

export async function getCINCameraStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
}

/** No-op — modèles OCR côté serveur uniquement. */
export function preloadOcrEngine() {
  return Promise.resolve();
}

export async function compressImage(dataUrl, maxWidth = 1800, quality = 0.85) {
  if (!dataUrl || !isImageDataUrl(dataUrl)) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const API_MAX_BASE64 = 1_800_000;

async function compressForApi(dataUrl) {
  if (!dataUrl) return null;
  let out = dataUrl;
  try {
    out = await compressImage(dataUrl, isMobileDevice() ? 1600 : 1800, 0.86);
  } catch (_) { /* keep */ }
  let pass = 0;
  while (String(out).length > API_MAX_BASE64 && pass < 4) {
    const w = Math.max(1000, 1600 - 200 * (pass + 1));
    const q = Math.max(0.6, 0.86 - pass * 0.07);
    try {
      out = await compressImage(out, w, q);
    } catch (_) {
      break;
    }
    pass += 1;
  }
  return out;
}

/**
 * Analyse qualité locale rapide (avant envoi).
 */
export async function assessClientQuality(dataUrl) {
  if (!dataUrl) {
    return { score: 0, label: 'inexploitable', messages: ['Image manquante'], block_ocr: true };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const messages = [];
      let score = 100;
      const minSide = Math.min(w, h);
      if (minSide < 400) {
        messages.push('Résolution insuffisante');
        score -= 35;
      }
      const canvas = document.createElement('canvas');
      const cw = Math.min(320, w);
      const ch = Math.round((h * cw) / w);
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch).data;
      let sum = 0;
      let sumSq = 0;
      let bright = 0;
      let over = 0;
      let under = 0;
      const n = cw * ch;
      for (let i = 0; i < data.length; i += 4) {
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        bright += g;
        if (g > 245) over += 1;
        if (g < 25) under += 1;
      }
      bright /= n;
      over /= n;
      under /= n;
      // variance proxy (blur)
      for (let y = 1; y < ch - 1; y += 2) {
        for (let x = 1; x < cw - 1; x += 2) {
          const i = (y * cw + x) * 4;
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const i2 = ((y + 1) * cw + x) * 4;
          const g2 = 0.299 * data[i2] + 0.587 * data[i2 + 1] + 0.114 * data[i2 + 2];
          const d = g - g2;
          sum += d;
          sumSq += d * d;
        }
      }
      const samples = Math.max(1, Math.floor(((ch - 2) / 2) * ((cw - 2) / 2)));
      const variance = sumSq / samples - (sum / samples) ** 2;

      if (variance < 12) {
        messages.push('Image trop floue, veuillez reprendre la photo.');
        score -= 40;
      } else if (variance < 28) {
        messages.push('Image un peu floue');
        score -= 12;
      }
      if (bright < 45 || under > 0.35) {
        messages.push('Image trop sombre');
        score -= 25;
      }
      if (bright > 220 || over > 0.28) {
        messages.push('Image surexposée');
        score -= 25;
      }
      if (over > 0.18) {
        messages.push('Trop de reflet sur la carte.');
        score -= 15;
      }

      score = Math.max(0, Math.min(100, score));
      let label = 'bonne';
      if (score < 25) label = 'inexploitable';
      else if (score < 55) label = 'faible';
      else if (score < 75) label = 'acceptable';
      if (score >= 75 && messages.length === 0) messages.push('Bonne qualité.');
      else if (score >= 55 && !messages.some((m) => /acceptable|Bonne/i.test(m))) {
        messages.push('Qualité acceptable.');
      }

      resolve({
        score,
        label,
        messages,
        block_ocr: score < 25 || minSide < 280,
        metrics: { width: w, height: h, variance: Math.round(variance), brightness: Math.round(bright) },
      });
    };
    img.onerror = () => resolve({
      score: 0,
      label: 'inexploitable',
      messages: ['Image non lisible'],
      block_ocr: true,
    });
    img.src = dataUrl;
  });
}

function friendlyError(code, fallback) {
  const map = {
    OCR_UNAVAILABLE: 'Service OCR indisponible',
    OCR_NOT_CONFIGURED: 'Service OCR indisponible',
    OCR_TIMEOUT: "Temps d'analyse dépassé",
    IMAGE_UNREADABLE: 'Image non lisible',
    RECTO_MISSING: 'Recto manquant',
    VERSO_MISSING: 'Verso manquant',
    PARTIAL: 'Analyse partielle',
    PAYLOAD_TOO_LARGE: 'Image trop volumineuse',
  };
  return map[code] || fallback || 'Analyse impossible';
}

/**
 * @param {string} rectoSource data URL
 * @param {string|null} versoSource
 * @param {{ force?: boolean, onProgress?: (step: string) => void }} options
 */
export async function scanCIN(rectoSource, versoSource, options = {}) {
  const { force = false, onProgress } = options;
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };

  if (!rectoSource) {
    const err = new Error('Recto manquant');
    err.code = 'RECTO_MISSING';
    throw err;
  }

  progress('Préparation de l\'image');
  const recto = await compressForApi(rectoSource);
  const verso = versoSource ? await compressForApi(versoSource) : null;

  if (!force) {
    const qR = await assessClientQuality(recto);
    if (qR.block_ocr) {
      const err = new Error(qR.messages[0] || 'Image non lisible');
      err.code = 'IMAGE_UNREADABLE';
      err.quality = { recto: qR };
      err.allow_force = true;
      throw err;
    }
  }

  progress('Lecture du recto');
  if (verso) progress('Lecture du verso');

  const base = getOcrApiUrl().replace(/\/$/, '');
  const url = `${base}/ocr/moroccan-cin`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);

  let res;
  try {
    progress('Extraction des champs');
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ recto, verso, force }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e?.name === 'AbortError';
    const err = new Error(timedOut ? "Temps d'analyse dépassé" : 'Service OCR indisponible');
    err.code = timedOut ? 'OCR_TIMEOUT' : 'OCR_UNAVAILABLE';
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (isOcrDebugEnabled()) {
    console.info('[OCR CIN] response', {
      status: res.status,
      ok: json.ok,
      engine: json.engine_used,
      partial: json.partial,
    });
  }

  if (!res.ok || json.ok === false) {
    const code = json.error_code || (res.status === 504 ? 'OCR_TIMEOUT' : 'OCR_UNAVAILABLE');
    const err = new Error(friendlyError(code, json.error || json._ocr_warning));
    err.code = code;
    err.quality = { recto: json.quality_recto, verso: json.quality_verso };
    err.allow_force = json.allow_force !== false;
    err.payload = json;
    throw err;
  }

  progress('Vérification terminée');

  return {
    cin: json.cin || '',
    prenom: json.prenom || '',
    nom: json.nom || '',
    date_naissance: json.date_naissance || '',
    ville_naissance: json.ville_naissance || '',
    nationalite: json.nationalite || 'Marocaine',
    sexe: json.sexe || '',
    date_expiration: json.date_expiration || '',
    nom_arabe: json.nom_arabe || '',
    prenom_arabe: json.prenom_arabe || '',
    fields: json.fields || {},
    confidence_globale: json.confidence_globale || 'moyenne',
    recto: json.recto || null,
    verso: json.verso || null,
    warnings: json.warnings || [],
    progress: json.progress || [],
    engine_used: json.engine_used,
    engine_version: json.engine_version,
    provider: 'citymo',
    _ocr_provider_used: json.engine_used || 'citymo',
    _ocr_warning: (json.warnings || []).join(' — '),
    _ocr_partial: !!json.partial,
    _ocr_raw: json,
  };
}
