/**
 * ocr.js — Client OCR CIN marocaine (production).
 * Appelle UNIQUEMENT POST /api/workers/cin/analyze (backend Node).
 * Tesseract.js désactivé en production (ENABLE_BROWSER_OCR_FALLBACK=false).
 */
import { resolveApiBaseUrl } from '../config/env';
import { getSupabase } from '../lib/supabase';

const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

const FILL_MIN_CONFIDENCE = 0.70;

/**
 * Garantit un message toast lisible — jamais [object Object].
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function getReadableMessage(value, fallback = 'Une erreur est survenue. Saisie manuelle disponible.') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]') return fallback;
    return s;
  }
  if (value instanceof Error) {
    return getReadableMessage(value.message, fallback);
  }
  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) {
      return getReadableMessage(value.message, fallback);
    }
    if (typeof value.error === 'string' && value.error.trim()) {
      return getReadableMessage(value.error, fallback);
    }
    if (value.error && typeof value.error === 'object') {
      return getReadableMessage(value.error, fallback);
    }
    if (typeof value.msg === 'string' && value.msg.trim()) return value.msg.trim();
  }
  return fallback;
}

/** JJ/MM/AAAA, JJ.MM.AAAA, JJ-MM-AAAA → YYYY-MM-DD (ou chaîne déjà ISO). */
export function normalizeDateToIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return s;
    return '';
  }
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return '';
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += yy >= 50 ? 1900 : 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 1900 || yy > 2100) return '';
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function normalizeSexeValue(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (/^(m|male|masculin|homme|ذكر)$/i.test(s) || s === 'm') return 'M';
  if (/^(f|female|feminin|féminin|femme|أنثى)$/i.test(s) || s === 'f') return 'F';
  if (/\bm\b/.test(s) && !/\bf\b/.test(s)) return 'M';
  if (/\bf\b/.test(s)) return 'F';
  return '';
}

function unwrapOcrPayload(response) {
  if (!response || typeof response !== 'object') return {};
  if (response.data && typeof response.data === 'object' && (response.data.fields || response.data.worker_form || response.data.cin)) {
    return response.data;
  }
  if (response.extracted && typeof response.extracted === 'object' && !response.fields) {
    return { fields: response.extracted, ...response };
  }
  return response;
}

function extractFieldValue(raw) {
  if (raw == null) return { value: '', confidence: null, level: null, valid: null };
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { value: String(raw).trim(), confidence: null, level: null, valid: true };
  }
  if (typeof raw === 'object') {
    const value = raw.value != null ? String(raw.value).trim()
      : (raw.text != null ? String(raw.text).trim() : '');
    return {
      value,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
      level: raw.confidence_level || raw.confidence || null,
      valid: raw.valid,
      requires_manual_review: raw.requires_manual_review,
      confidence_from_vision: raw.confidence_from_vision,
    };
  }
  return { value: '', confidence: null, level: null, valid: null };
}

/**
 * Normalise toute variante de réponse API OCR → contrat formulaire stable.
 * Jamais undefined : chaînes vides.
 */
export function normalizeCnieOcrResponse(response) {
  const root = unwrapOcrPayload(response);
  const fields = root.fields || root.extracted || {};
  const wf = root.worker_form || {};

  const pick = (...candidates) => {
    for (const c of candidates) {
      const ex = extractFieldValue(c);
      if (ex.value) return ex;
    }
    return { value: '', confidence: null, level: null, valid: null };
  };

  const cin = pick(fields.cin, fields.numero_cin, wf.cin, root.cin);
  const nom = pick(fields.nom, wf.nom, root.nom);
  const prenom = pick(fields.prenom, wf.prenom, root.prenom);
  const date_naissance = pick(fields.date_naissance, wf.date_naissance, root.date_naissance);
  const date_expiration = pick(fields.date_expiration, wf.date_expiration, root.date_expiration);
  const sexe = pick(fields.sexe, wf.sexe, root.sexe);
  const lieu = pick(
    fields.lieu_naissance,
    fields.ville_naissance,
    wf.ville_naissance,
    wf.lieu_naissance,
    root.ville_naissance,
    root.lieu_naissance,
  );
  const nationalite = pick(fields.nationalite, wf.nationalite, root.nationalite);
  const autorite = pick(fields.autorite, wf.autorite, root.autorite);
  const adresse = pick(fields.adresse, wf.adresse, root.adresse);

  const confidence = {};
  const setConf = (key, ex) => {
    const level = normalizeConfidenceLevel(ex.level, ex.confidence);
    confidence[key] = {
      confidence: level,
      confidence_level: level,
      requires_manual_review: ex.requires_manual_review === true || level === 'faible' || level === 'moyenne',
      confidence_from_vision: !!ex.confidence_from_vision,
    };
    if (ex.confidence_from_vision && Number.isFinite(ex.confidence) && ex.confidence > 0) {
      confidence[key].confidence_pct = Math.round(ex.confidence * 100);
    }
  };

  const out = {
    cin: String(cin.value || '').replace(/\s+/g, '').toUpperCase(),
    nom: String(nom.value || '').trim(),
    prenom: String(prenom.value || '').trim(),
    date_naissance: normalizeDateToIso(date_naissance.value),
    date_expiration: normalizeDateToIso(date_expiration.value),
    sexe: normalizeSexeValue(sexe.value),
    lieu_naissance: String(lieu.value || '').trim(),
    nationalite: String(nationalite.value || '').trim(),
    autorite: String(autorite.value || '').trim(),
    adresse: String(adresse.value || '').trim(),
    confidence: {},
    warnings: Array.isArray(root.warnings) ? root.warnings.map((w) => getReadableMessage(w, '')).filter(Boolean) : [],
    partial: !!root.partial,
    ok: root.ok !== false && root.success !== false,
    engine_used: root.engine_used || null,
    faces_swapped: !!root.faces_swapped,
    _raw_root_keys: Object.keys(root || {}),
  };

  // Nationalité parasite
  if (out.nationalite.length <= 2 || /^[àâäaá]$/i.test(out.nationalite)) {
    out.nationalite = '';
  }

  setConf('cin', cin);
  setConf('nom', nom);
  setConf('prenom', prenom);
  setConf('date_naissance', date_naissance);
  setConf('date_expiration', date_expiration);
  setConf('sexe', sexe);
  setConf('lieu_naissance', lieu);
  setConf('ville_naissance', lieu);
  setConf('nationalite', nationalite);
  setConf('autorite', autorite);
  setConf('adresse', adresse);
  out.confidence = confidence;

  return out;
}

function logResponseShapeDev(json) {
  try {
    if (!isOcrDebugEnabled() && !import.meta.env.DEV) return;
    const root = unwrapOcrPayload(json);
    const fields = root.fields || {};
    const fieldTypes = {};
    Object.keys(fields).forEach((k) => {
      const v = fields[k];
      fieldTypes[k] = v == null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    });
    LOG('response shape', {
      rootKeys: Object.keys(root),
      fieldKeys: Object.keys(fields),
      fieldTypes,
      hasWorkerForm: Boolean(root.worker_form),
      ok: root.ok,
      success: root.success,
      error_code: root.error_code || null,
    });
  } catch (_) { /* ignore */ }
}

/** Labels UI : haute | moyenne | faible (alias elevee → haute). */
export function normalizeConfidenceLevel(raw, numericFallback) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'haute' || s === 'elevee' || s === 'élevée' || s === 'eleve') return 'haute';
  if (s === 'moyenne') return 'moyenne';
  if (s === 'faible' || s === 'non_detecte') return s === 'non_detecte' ? 'non_detecte' : 'faible';
  const n = Number(numericFallback);
  if (Number.isFinite(n)) {
    if (n >= 0.85) return 'haute';
    if (n >= 0.70) return 'moyenne';
    if (n > 0) return 'faible';
  }
  return 'non_detecte';
}

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
 * Ne remplit que les champs avec valeur exploitable (confiance ≥ 0.70 si numérique).
 * Nationalité invalide / « À » → jamais injectée.
 */
export function pickFillableFields(json) {
  const normalized = normalizeCnieOcrResponse(json);
  const out = {};
  const meta = {};

  const formMap = [
    ['cin', 'cin'],
    ['prenom', 'prenom'],
    ['nom', 'nom'],
    ['date_naissance', 'date_naissance'],
    ['ville_naissance', 'lieu_naissance'],
    ['nationalite', 'nationalite'],
    ['sexe', 'sexe'],
    ['date_expiration', 'date_expiration'],
    ['adresse', 'adresse'],
    ['autorite', 'autorite'],
  ];

  for (const [formKey, normKey] of formMap) {
    const value = String(normalized[normKey] || '').trim();
    if (!value) continue;
    const confMeta = normalized.confidence?.[normKey] || normalized.confidence?.[formKey] || {};
    const level = normalizeConfidenceLevel(confMeta.confidence_level || confMeta.confidence, null);
    if (level === 'faible') {
      // suggestion faible : on propose quand même mais marqué à vérifier
    }
    out[formKey] = value;
    meta[formKey] = {
      confidence: level === 'non_detecte' ? 'moyenne' : level,
      confidence_level: level === 'non_detecte' ? 'moyenne' : level,
      requires_manual_review: level !== 'haute',
      ...(confMeta.confidence_from_vision ? {
        confidence_from_vision: true,
        confidence_pct: confMeta.confidence_pct,
      } : {}),
    };
  }

  return {
    map: out,
    meta,
    fields: json?.fields || {},
    normalized,
  };
}

export function normalizeBackendResult(json) {
  const { map, meta, fields, normalized } = pickFillableFields(json);
  const globale = normalizeConfidenceLevel(json.confidence_globale, null);
  const filledCount = Object.keys(map).filter((k) => map[k]).length;
  return {
    ok: true,
    success: true,
    ...map,
    ville_naissance: map.ville_naissance || '',
    nationalite: map.nationalite || null,
    fields,
    field_meta: meta,
    confidence_globale: globale === 'non_detecte' ? 'moyenne' : globale,
    progress: json.progress || [],
    warnings: normalized.warnings || json.warnings || [],
    engine_used: json.engine_used,
    engine_version: json.engine_version,
    duration_ms: json.duration_ms,
    faces_swapped: !!json.faces_swapped,
    provider: 'citymo',
    _ocr_provider_used: json.engine_used || 'citymo',
    _ocr_warning: (normalized.warnings || json.warnings || []).join(' — '),
    _ocr_partial: !!json.partial || filledCount < 4,
    _ocr_fallback: false,
    _ocr_raw: json,
    _normalized: normalized,
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

  if (!rectoSource && !versoSource) {
    const err = new Error('Importez au moins une face CIN (recto et/ou verso).');
    err.code = 'RECTO_MISSING';
    throw err;
  }

  progress('Préparation des images');
  const front = rectoSource ? await compressForApi(rectoSource) : null;
  const back = versoSource ? await compressForApi(versoSource) : null;

  if (!force && (front || back)) {
    const qR = front ? await assessClientQuality(front) : { block_ocr: false, messages: [] };
    const qV = back ? await assessClientQuality(back) : { block_ocr: false, messages: [] };
    // bloquer seulement si toutes les faces fournies sont inexploitables
    const faces = [front && qR, back && qV].filter(Boolean);
    if (faces.length && faces.every((q) => q.block_ocr)) {
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

    logResponseShapeDev(json);

    LOG('3. response', {
      status: res.status,
      ok: json.ok,
      code: json.error_code,
      engine: json.engine_used,
      ms: json.duration_ms,
      filled_keys: Object.keys(json.worker_form || {}).filter((k) => json.worker_form[k]),
    });

    if (res.status === 401) {
      const err = new Error(getReadableMessage(json.error || json.message, 'Authentification requise'));
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    if (json.ok === false || json.success === false || res.status >= 400) {
      const err = new Error(getReadableMessage(
        json.error || json.message,
        'Analyse CIN impossible — saisissez les champs manuellement.',
      ));
      err.code = json.error_code || 'OCR_FAILED';
      err.allow_force = json.allow_force !== false;
      err.quality = json.faces || null;
      throw err;
    }

    progress('Vérification terminée');
    return normalizeBackendResult(json);
  } catch (e) {
    if (e?.code) {
      e.message = getReadableMessage(e.message, e.message || 'Erreur OCR');
      throw e;
    }
    if (e?.name === 'AbortError') {
      const err = new Error("Temps d'analyse dépassé — saisie manuelle disponible.");
      err.code = 'OCR_TIMEOUT';
      err.allow_force = true;
      throw err;
    }
    const err = new Error(getReadableMessage(e, 'Service OCR indisponible — saisissez les champs manuellement.'));
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
  const level = fieldMeta?.[formKey]?.confidence_level || fieldMeta?.[formKey]?.confidence;
  if (level === 'faible' || level === 'non_detecte') return false;
  const conf = Number(fieldMeta?.[formKey]?.confidence);
  if (Number.isFinite(conf) && conf > 0 && conf < 1 && conf < FILL_MIN_CONFIDENCE) return false;
  if (normalizeConflictValue(cur) === normalizeConflictValue(det)) return false;
  const def = DEFAULT_FORM_VALUES[formKey];
  if (def && normalizeConflictValue(cur) === def) return false;
  return true;
}
