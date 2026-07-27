/**
 * ocr.js — Client OCR CIN marocaine.
 * Chaîne : backend CITYMO → si échec / vide → fallback Tesseract local OBLIGATOIRE.
 */
import { resolveApiBaseUrl } from '../config/env';

const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

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

export function preloadOcrEngine() {
  return import('./cinLocalOcr')
    .then((m) => m.preloadLocalOcr())
    .catch((err) => LOG('preloadOcrEngine failed', err?.message || err));
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

/** Au moins un champ identité utile extrait. */
export function hasExtractedIdentity(result) {
  if (!result || typeof result !== 'object') return false;
  const keys = ['cin', 'prenom', 'nom', 'date_expiration', 'sexe'];
  return keys.some((k) => String(result[k] || '').trim() !== '');
}

function normalizeBackendResult(json) {
  const wf = json.worker_form || {};
  const fields = json.fields || {};
  const pick = (flat, formKey, fieldKey) => {
    if (flat != null && String(flat).trim() !== '') return String(flat).trim();
    if (wf[formKey] != null && String(wf[formKey]).trim() !== '') return String(wf[formKey]).trim();
    const fv = fields[fieldKey];
    if (fv && typeof fv === 'object' && fv.value != null && String(fv.value).trim() !== '') {
      return String(fv.value).trim();
    }
    if (typeof fv === 'string' && fv.trim()) return fv.trim();
    return '';
  };
  return {
    ok: true,
    success: true,
    cin: pick(json.cin, 'cin', 'numero_cin'),
    prenom: pick(json.prenom, 'prenom', 'prenom'),
    nom: pick(json.nom, 'nom', 'nom'),
    date_naissance: pick(json.date_naissance, 'date_naissance', 'date_naissance'),
    ville_naissance: pick(json.ville_naissance, 'ville_naissance', 'lieu_naissance'),
    nationalite: pick(json.nationalite, 'nationalite', 'nationalite') || 'Marocaine',
    sexe: pick(json.sexe, 'sexe', 'sexe'),
    date_expiration: pick(json.date_expiration, 'date_expiration', 'date_expiration'),
    nom_arabe: pick(json.nom_arabe, 'nom_arabe', 'nom_arabe'),
    prenom_arabe: pick(json.prenom_arabe, 'prenom_arabe', 'prenom_arabe'),
    fields,
    confidence_globale: json.confidence_globale || 'moyenne',
    recto: json.recto || null,
    verso: json.verso || null,
    warnings: json.warnings || [],
    progress: json.progress || [],
    engine_used: json.engine_used,
    engine_version: json.engine_version,
    models_used: json.models_used || json.engine_manifest?.models || null,
    provider: 'citymo',
    _ocr_provider_used: json.engine_used || 'citymo',
    _ocr_warning: (json.warnings || []).join(' — '),
    _ocr_partial: !!json.partial,
    _ocr_fallback: false,
    _ocr_raw: json,
  };
}

/**
 * Détermine si le fallback local DOIT tourner.
 * Ne dépend pas uniquement d'un catch réseau.
 */
export function mustRunLocalFallback({ networkFail, status, json, normalized }) {
  if (networkFail) return { yes: true, reason: 'network_fail' };
  if (status == null) return { yes: true, reason: 'no_status' };
  if (status !== 200) return { yes: true, reason: `status_${status}` };

  const successFlag = json?.success;
  const okFlag = json?.ok;
  if (successFlag === false) return { yes: true, reason: 'success_false' };
  if (okFlag === false) return { yes: true, reason: 'ok_false' };

  const code = String(json?.error_code || '');
  if (
    code === 'OCR_UNAVAILABLE'
    || code === 'OCR_NOT_CONFIGURED'
    || code === 'OCR_TIMEOUT'
    || code === 'OCR_FAILED'
  ) {
    return { yes: true, reason: code };
  }

  if (!normalized || !hasExtractedIdentity(normalized)) {
    return { yes: true, reason: 'no_extracted_data' };
  }

  return { yes: false, reason: 'backend_ok' };
}

/**
 * @param {string} rectoSource data URL
 * @param {string|null} versoSource
 * @param {{ force?: boolean, onProgress?: (step: string) => void }} options
 */
export async function scanCIN(rectoSource, versoSource, options = {}) {
  const { force = false, onProgress } = options;
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };

  LOG('1. scanCIN START', { hasRecto: !!rectoSource, hasVerso: !!versoSource, force });

  if (!rectoSource) {
    const err = new Error('Recto manquant');
    err.code = 'RECTO_MISSING';
    throw err;
  }

  progress('Préparation de l\'image');
  const recto = await compressForApi(rectoSource);
  const verso = versoSource ? await compressForApi(versoSource) : null;
  LOG('2. images compressed', {
    rectoLen: recto ? String(recto).length : 0,
    versoLen: verso ? String(verso).length : 0,
  });

  if (!force) {
    const qR = await assessClientQuality(recto);
    LOG('3. quality recto', qR?.label, qR?.score, qR?.block_ocr);
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
  LOG('4. BEFORE backend OCR', { url });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);

  let res = null;
  let networkFail = false;
  let networkError = null;
  let json = {};
  let status = null;

  try {
    progress('Extraction des champs');
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ recto, verso, force }),
      signal: ctrl.signal,
    });
    status = res.status;
  } catch (e) {
    networkFail = true;
    networkError = e;
    LOG('4b. backend fetch THROW', e?.name, e?.message);
  } finally {
    clearTimeout(timer);
  }

  let normalized = null;
  if (!networkFail && res) {
    const contentType = res.headers?.get?.('content-type') || '';
    try {
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = { ok: false, error: 'Réponse OCR non-JSON', error_code: 'OCR_UNAVAILABLE', _raw_preview: text.slice(0, 80) };
        LOG('5. AFTER backend OCR — JSON parse fail', { status, contentType, preview: text.slice(0, 80) });
      }
    } catch (e) {
      json = { ok: false, error: 'Lecture réponse OCR impossible', error_code: 'OCR_UNAVAILABLE' };
      networkFail = true;
      networkError = e;
    }

    LOG('5. AFTER backend OCR', {
      status,
      ok: json?.ok,
      success: json?.success,
      error_code: json?.error_code,
      error: json?.error,
      keys: json && typeof json === 'object' ? Object.keys(json) : [],
    });

    if (status === 200 && json && json.ok !== false && json.success !== false) {
      normalized = normalizeBackendResult(json);
      LOG('5b. normalized backend', {
        cin: normalized.cin,
        prenom: normalized.prenom,
        nom: normalized.nom,
        hasData: hasExtractedIdentity(normalized),
      });
    }
  }

  const decision = mustRunLocalFallback({ networkFail, status, json, normalized });
  LOG('6. fallback decision', decision, { networkFail, status });

  if (!decision.yes && normalized) {
    progress('Vérification terminée');
    LOG('7. RETURN backend result (no fallback)');
    return normalized;
  }

  LOG('8. BEFORE fallback local', {
    reason: decision.reason,
    networkError: networkError?.message,
    backendError: json?.error,
    backendCode: json?.error_code,
  });
  progress('Secours : lecture locale…');

  try {
    const { scanCINLocal } = await import('./cinLocalOcr');
    const local = await scanCINLocal(recto, verso, { onProgress });
    LOG('9. AFTER fallback local', {
      cin: local.cin,
      prenom: local.prenom,
      nom: local.nom,
      hasData: hasExtractedIdentity(local),
      textPreview: local._ocr_raw_text_preview,
    });
    progress('Vérification terminée');
    // Même si le backend disait IMAGE_UNREADABLE, on retourne le résultat local
    // (vide éventuel) pour laisser l’UI injecter ce qui est disponible.
    return local;
  } catch (localErr) {
    LOG('9. AFTER fallback local FAIL', localErr?.message || localErr);
    if (!force && json?.error_code === 'IMAGE_UNREADABLE') {
      const err = new Error(json.error || 'Image non lisible');
      err.code = 'IMAGE_UNREADABLE';
      err.allow_force = true;
      err.quality = { recto: json.quality_recto, verso: json.quality_verso };
      throw err;
    }
    const err = new Error(
      localErr?.message
        || 'Extraction locale impossible — saisissez les champs manuellement.',
    );
    err.code = 'OCR_UNAVAILABLE';
    err.cause = localErr;
    throw err;
  }
}

export async function syncOcrLearning(workers) {
  if (!Array.isArray(workers) || workers.length === 0) return;
  try {
    const base = getOcrApiUrl().replace(/\/$/, '');
    await fetch(`${base}/ocr/learning/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workers: workers.slice(0, 500).map((w) => ({
          nom: w.nom,
          prenom: w.prenom,
          ville_naissance: w.ville_naissance,
        })),
      }),
    });
  } catch (_) { /* non bloquant */ }
}
