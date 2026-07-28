/**
 * ocr.js — Client OCR CIN marocaine (production).
 * Appelle UNIQUEMENT POST /api/workers/cin/analyze (backend Node).
 * Tesseract.js désactivé en production (ENABLE_BROWSER_OCR_FALLBACK=false).
 */
import { resolveApiBaseUrl } from '../config/env';
import { getSupabase } from '../lib/supabase';

const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

const FILL_MIN_CONFIDENCE = 0.70;

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

/** Tesseract navigateur : uniquement si flag backend-équivalent côté build (jamais en prod). */
export function isBrowserOcrFallbackEnabled() {
  try {
    if (import.meta.env.PROD) return false;
    if (import.meta.env.VITE_ENABLE_BROWSER_OCR_FALLBACK === 'true') return true;
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
  // Tesseract retiré du chemin production — no-op.
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
      if (w < 640 || h < 400) {
        messages.push('Résolution insuffisante');
        score -= 40;
      }
      const canvas = document.createElement('canvas');
      const cw = Math.min(320, w);
      const ch = Math.round((h * cw) / w);
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const mean = sum / (data.length / 4);
      if (mean < 45) {
        messages.push('Image trop sombre');
        score -= 35;
      }
      if (mean > 220) {
        messages.push('Image trop claire');
        score -= 35;
      }
      const block = score < 45 || messages.length >= 2;
      resolve({
        score: Math.max(0, score),
        label: block ? 'inexploitable' : score >= 70 ? 'bonne' : 'moyenne',
        messages,
        block_ocr: block,
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

export function hasExtractedIdentity(result) {
  if (!result || typeof result !== 'object') return false;
  const keys = ['cin', 'prenom', 'nom', 'date_expiration', 'sexe'];
  return keys.some((k) => String(result[k] || '').trim() !== '');
}

function fieldUsable(field) {
  if (!field || typeof field !== 'object') return false;
  if (field.valid === false) return false;
  if (field.value == null || String(field.value).trim() === '') return false;
  const conf = Number(field.confidence);
  if (Number.isFinite(conf) && conf < FILL_MIN_CONFIDENCE) return false;
  return true;
}

/**
 * Ne remplit que valid=true et confidence >= 0.70.
 * Nationalité invalide / « À » → jamais injectée.
 */
export function pickFillableFields(json) {
  const fields = json?.fields || {};
  const wf = json?.worker_form || {};
  const out = {};
  const meta = {};

  const mapping = [
    ['cin', 'cin', 'numero_cin'],
    ['prenom', 'prenom', 'prenom'],
    ['nom', 'nom', 'nom'],
    ['date_naissance', 'date_naissance', 'date_naissance'],
    ['ville_naissance', 'ville_naissance', 'lieu_naissance'],
    ['nationalite', 'nationalite', 'nationalite'],
    ['sexe', 'sexe', 'sexe'],
    ['date_expiration', 'date_expiration', 'date_expiration'],
    ['nom_arabe', 'nom_arabe', 'nom_arabe'],
    ['prenom_arabe', 'prenom_arabe', 'prenom_arabe'],
    ['adresse', 'adresse', 'adresse'],
  ];

  for (const [formKey, wfKey, fieldKey] of mapping) {
    const f = fields[fieldKey] || fields[wfKey];
    let value = null;
    let confidence = 0;
    if (fieldUsable(f)) {
      value = String(f.value).trim();
      confidence = Number(f.confidence) || 0;
    } else if (wf[wfKey] != null && String(wf[wfKey]).trim() !== '') {
      // worker_form déjà filtré côté serveur
      value = String(wf[wfKey]).trim();
      confidence = 0.75;
    }
    if (formKey === 'nationalite') {
      if (!value || value.length <= 2 || /^[àâäaá]$/i.test(value)) {
        value = null;
      }
    }
    if (value) {
      out[formKey] = value;
      meta[formKey] = { confidence, confidence_pct: Math.round(confidence * 100) };
    }
  }
  return { map: out, meta, fields };
}

export function normalizeBackendResult(json) {
  const { map, meta, fields } = pickFillableFields(json);
  return {
    ok: true,
    success: true,
    ...map,
    nationalite: map.nationalite || null,
    fields,
    field_meta: meta,
    confidence_globale: json.confidence_globale || 'moyenne',
    progress: json.progress || [],
    warnings: json.warnings || [],
    engine_used: json.engine_used,
    engine_version: json.engine_version,
    provider: 'citymo',
    _ocr_provider_used: json.engine_used || 'citymo',
    _ocr_warning: (json.warnings || []).join(' — '),
    _ocr_partial: !!json.partial,
    _ocr_fallback: false,
    _ocr_raw: json,
  };
}

async function getAccessToken() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

/**
 * @param {string} rectoSource data URL
 * @param {string|null} versoSource
 * @param {{ force?: boolean, onProgress?: (step: string) => void }} options
 */
export async function scanCIN(rectoSource, versoSource, options = {}) {
  const { force = false, onProgress } = options;
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };

  LOG('1. scanCIN START (Node proxy only)', { hasRecto: !!rectoSource, hasVerso: !!versoSource, force });

  if (!rectoSource) {
    const err = new Error('Recto manquant');
    err.code = 'RECTO_MISSING';
    throw err;
  }
  if (!versoSource) {
    const err = new Error('Verso obligatoire');
    err.code = 'VERSO_MISSING';
    throw err;
  }

  progress('Préparation des images');
  const front = await compressForApi(rectoSource);
  const back = await compressForApi(versoSource);

  if (!force) {
    const qR = await assessClientQuality(front);
    const qV = await assessClientQuality(back);
    if (qR.block_ocr || qV.block_ocr) {
      const err = new Error(qR.messages[0] || qV.messages[0] || 'Image non lisible');
      err.code = 'IMAGE_UNREADABLE';
      err.quality = { recto: qR, verso: qV };
      err.allow_force = true;
      throw err;
    }
  }

  progress('Analyse CIN (serveur)');
  const base = getOcrApiUrl().replace(/\/$/, '');
  const url = `${base}/workers/cin/analyze`;
  LOG('2. POST', url);

  const token = await getAccessToken();
  if (!token) {
    const err = new Error('Session expirée — reconnectez-vous pour analyser la CIN.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ front, back, recto: front, verso: back, force }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, error: 'Réponse OCR invalide', error_code: 'OCR_FAILED' };
    }

    LOG('3. response', { status: res.status, ok: json.ok, code: json.error_code });

    if (res.status === 401) {
      const err = new Error(json.error || 'Authentification requise');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    if (json.ok === false || json.success === false || res.status >= 400) {
      const err = new Error(json.error || 'Analyse CIN impossible');
      err.code = json.error_code || 'OCR_FAILED';
      err.allow_force = json.allow_force !== false;
      err.quality = json.faces || null;
      // Pas de fallback Tesseract — saisie manuelle disponible.
      throw err;
    }

    progress('Vérification terminée');
    return normalizeBackendResult(json);
  } catch (e) {
    if (e?.code) throw e;
    if (e?.name === 'AbortError') {
      const err = new Error("Temps d'analyse dépassé");
      err.code = 'OCR_TIMEOUT';
      err.allow_force = true;
      throw err;
    }
    const err = new Error(e?.message || 'Service OCR indisponible — saisissez les champs manuellement.');
    err.code = 'OCR_UNAVAILABLE';
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated learning sync — désactivé (pas d’endpoint prod dédié). */
export async function syncOcrLearning() {
  return undefined;
}

/** Helpers conflits UI */
export function normalizeConflictValue(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

const DEFAULT_FORM_VALUES = {
  nationalite: 'marocaine',
};

/**
 * Conflit réel uniquement si valeur utilisateur réelle ≠ détection valide (conf≥0.70).
 */
export function isRealFieldConflict(formKey, current, detected, fieldMeta) {
  const cur = String(current || '').trim();
  const det = String(detected || '').trim();
  if (!cur || !det) return false;
  if (det.length <= 1) return false;
  const conf = Number(fieldMeta?.[formKey]?.confidence);
  if (Number.isFinite(conf) && conf < FILL_MIN_CONFIDENCE) return false;
  if (normalizeConflictValue(cur) === normalizeConflictValue(det)) return false;
  const def = DEFAULT_FORM_VALUES[formKey];
  if (def && normalizeConflictValue(cur) === def) return false;
  return true;
}
