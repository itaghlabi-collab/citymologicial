/**
 * ocr.js — Scan CIN marocaine : Mindee (prioritaire) → Tesseract fallback
 * MINDEE_API_KEY : uniquement sur Vercel/server (api/ocr/moroccan-cin), jamais VITE_* côté navigateur.
 */
import { resolveApiBaseUrl } from '../config/env';
import {
  emptyCINExtract,
  extractMindeeFields,
  mapMindeeFields,
  mapTesseractText,
  mergeCINRectoVerso,
  mergeSideExtracts,
  mapToWorkerForm,
  buildOcrWarning,
  identityFieldsComplete,
  isValidPersonName,
  resolveCINIdentity,
  pickMindeeValue,
} from './cinOcr';

import { CIN_FRAME_MASK as CIN_CROP } from './cinCapture';
import { buildOcrAuditReport, logOcrAuditReport } from './ocrAudit';

/** Zone cadre scanner CIN (alignée sur SVG mask + .cin-vf-frame) */
export { CIN_CROP };
/** Bande MRZ (bas verso CNIE — prénom/nom latins) */
export const MRZ_CROP = { x: 0.03, y: 0.55, w: 0.94, h: 0.40 };
/** Zone adresse verso (haut / centre, au-dessus MRZ) */
export const VERSO_ADDRESS_CROP = { x: 0.04, y: 0.08, w: 0.92, h: 0.46 };
/** Zone noms recto (partie droite, sous l'en-tête) */
export const NAMES_CROP = { x: 0.32, y: 0.12, w: 0.63, h: 0.42 };
/** Zone date de naissance recto CNIE (sous nom/prénom). */
export const BIRTH_CROP = { x: 0.04, y: 0.38, w: 0.58, h: 0.28 };

var _tesseractPromise = null;
var _tesseractWorkerPromise = null;
var _tesseractWorker = null;

function tessMaxWidth() {
  return isMobileDevice() ? 1400 : 1800;
}

export function getOcrApiUrl() {
  return resolveApiBaseUrl();
}

/** Limite body Vercel (~4.5 Mo) — images compressées avant POST Mindee. */
const MINDEE_API_MAX_WIDTH = 1800;
const MINDEE_API_MAX_BASE64_LEN = 1_450_000;

async function compressForMindeeApi(dataUrl) {
  if (!dataUrl || !isImageDataUrl(String(dataUrl))) return null;
  let out = dataUrl;
  try {
    out = await compressImage(dataUrl, MINDEE_API_MAX_WIDTH, 0.86);
  } catch (_) { /* keep original */ }

  let pass = 0;
  while (String(out).length > MINDEE_API_MAX_BASE64_LEN && pass < 4) {
    const w = Math.max(1100, MINDEE_API_MAX_WIDTH - 220 * (pass + 1));
    const q = Math.max(0.62, 0.86 - pass * 0.07);
    try {
      out = await compressImage(out, w, q);
    } catch (_) {
      break;
    }
    pass += 1;
  }
  return out;
}

function estimatePayloadBytes(recto, verso) {
  return (recto ? String(recto).length : 0) + (verso ? String(verso).length : 0);
}

/** Mode debug : VITE_OCR_DEBUG=true ou localStorage citymo_ocr_debug=1 */
export function isOcrDebugEnabled() {
  try {
    if (import.meta.env.VITE_OCR_DEBUG === 'true') return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('citymo_ocr_debug') === '1') return true;
  } catch (_) { /* ignore */ }
  return false;
}

function describeDataUrlStats(dataUrl, label) {
  if (!dataUrl) return { label, present: false };
  const len = String(dataUrl).length;
  const approxKb = Math.round((len * 3) / 4 / 1024);
  return new Promise(function(resolve) {
    const img = new Image();
    img.onload = function() {
      resolve({
        label,
        present: true,
        width: img.width,
        height: img.height,
        approxKb,
        base64Len: len,
      });
    };
    img.onerror = function() {
      resolve({ label, present: true, width: 0, height: 0, approxKb, base64Len: len });
    };
    img.src = dataUrl;
  });
}

function formatMindeeFailureReport(sideLabel, res, json, text, apiUrl) {
  const diag = json?.diagnostics || {};
  return {
    side: sideLabel,
    status: res?.status,
    code: json?.code,
    message: json?.error || text?.slice(0, 400),
    body: text?.slice(0, 600),
    endpoint: `${apiUrl}/ocr/moroccan-cin`,
    mindee_api_key: diag.mindee_api_key || '(voir diagnostics serveur)',
    mindee_model_id: diag.mindee_model_id,
    mindee_endpoint: diag.endpoint,
    api_version: diag.api_version,
    side_errors: diag.side_errors,
  };
}

function formatMindeePostError(sideLabel, code, error, status, extra) {
  const parts = [];
  if (sideLabel) parts.push('[' + sideLabel + ']');
  if (code) parts.push(String(code));
  if (error) parts.push(String(error));
  if (status) parts.push('HTTP ' + status);
  if (extra?.mindee_endpoint) parts.push('endpoint=' + extra.mindee_endpoint);
  if (extra?.mindee_api_key) parts.push('MINDEE_API_KEY=' + extra.mindee_api_key);
  if (extra?.mindee_model_id) parts.push('MINDEE_MODEL_ID=' + extra.mindee_model_id);
  return parts.join(' — ') || 'Erreur Mindee inconnue';
}

async function postMindeeCin(apiUrl, body, sideLabel) {
  const endpoint = `${apiUrl}/ocr/moroccan-cin`;
  const debug = isOcrDebugEnabled();
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, isMobileDevice() ? 50000 : 55000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, debug }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch { json = {}; }
    if (res.status === 413) {
      const report = formatMindeeFailureReport(sideLabel, res, json, text, apiUrl);
      const msg = formatMindeePostError(sideLabel, 'PAYLOAD_TOO_LARGE', json.error || 'Images trop lourdes', 413, json.diagnostics);
      console.warn('[OCR CIN] Mindee échec (détail):', report);
      return { ok: false, error: msg, code: 'PAYLOAD_TOO_LARGE', status: 413, side: sideLabel, report };
    }
    if (!res.ok || !json.success) {
      const report = formatMindeeFailureReport(sideLabel, res, json, text, apiUrl);
      const msg = formatMindeePostError(
        sideLabel,
        json.code || 'OCR_BACKEND_ERROR',
        json.error || text.slice(0, 200) || 'Réponse serveur invalide',
        res.status,
        json.diagnostics,
      );
      console.warn('[OCR CIN] Mindee échec (détail):', report);
      if (json.code === 'MINDEE_MODEL_ID_MISSING') {
        console.error('[OCR CIN] Mindee non utilisé — fallback Tesseract (MINDEE_MODEL_ID manquant)');
      }
      return { ok: false, error: msg, code: json.code, status: res.status, side: sideLabel, report };
    }
    if (json.provider_final) {
      console.info('[OCR CIN] provider_final serveur =', json.provider_final, json.diagnostics || {});
    }
    if (debug && json.diagnostics) {
      console.info('[OCR CIN] Mindee diagnostics serveur', json.diagnostics);
    }
    return { ok: true, json, endpoint };
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? formatMindeePostError(sideLabel, 'TIMEOUT', 'Délai dépassé (API OCR)', '')
      : formatMindeePostError(sideLabel, 'NETWORK', err?.message || String(err), '');
    console.warn('[OCR CIN] Mindee échec:', msg);
    return { ok: false, error: msg, code: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', side: sideLabel };
  } finally {
    clearTimeout(timer);
  }
}

function loadTesseract() {
  if (_tesseractPromise) return _tesseractPromise;
  _tesseractPromise = new Promise(function(resolve, reject) {
    if (window.Tesseract) { resolve(window.Tesseract); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function() { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract init failed')); };
    s.onerror = function() { reject(new Error('Impossible de charger Tesseract.')); };
    document.head.appendChild(s);
  }).catch(function(err) {
    _tesseractPromise = null;
    throw err;
  });
  return _tesseractPromise;
}

/** Précharge Tesseract dès l’ouverture du scanner (mobile). */
export function preloadOcrEngine() {
  loadTesseract().catch(function() {});
  getOcrWorker().catch(function() {});
}

async function getOcrWorker() {
  if (_tesseractWorker) return _tesseractWorker;
  if (!_tesseractWorkerPromise) {
    _tesseractWorkerPromise = loadTesseract().then(async function(T) {
      var worker = await T.createWorker('fra+eng', 1, { logger: function() {} });
      _tesseractWorker = worker;
      return worker;
    }).catch(function(err) {
      _tesseractWorkerPromise = null;
      _tesseractWorker = null;
      throw err;
    });
  }
  return _tesseractWorkerPromise;
}

/** Agrandit + binarise la bande MRZ pour Tesseract. */
export function sharpenMrzForOcr(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      try {
        var scale = Math.min(3, Math.max(1.8, 1200 / Math.max(img.width, 1)));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        var id = ctx.getImageData(0, 0, w, h);
        var d = id.data;
        for (var i = 0; i < d.length; i += 4) {
          var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          var v = gray > 145 ? 255 : gray < 95 ? 0 : gray > 120 ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(id, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.94));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = function() { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

async function prepareOcrImage(dataUrl, crop, label) {
  var img = crop ? await cropRegion(dataUrl, crop) : dataUrl;
  if (label === 'mrz') {
    try { img = await sharpenMrzForOcr(img); } catch (_) { /* keep */ }
  } else {
    try { img = await enhanceForOcr(img); } catch (_) { /* keep */ }
  }
  return compressImage(img, tessMaxWidth(), 0.9);
}

/** Recadre une zone de l'image (ratios 0–1). */
export function cropRegion(dataUrl, crop) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      try {
        var W = img.width;
        var H = img.height;
        var x = Math.max(0, Math.round(W * crop.x));
        var y = Math.max(0, Math.round(H * crop.y));
        var w = Math.min(W - x, Math.round(W * crop.w));
        var h = Math.min(H - y, Math.round(H * crop.h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, w);
        c.height = Math.max(1, h);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.94));
      } catch (e) { reject(e); }
    };
    img.onerror = function() { reject(new Error('Recadrage impossible.')); };
    img.src = dataUrl;
  });
}

/** Recadre l'image sur la zone CIN (meilleure lecture OCR). */
export function cropCINRegion(dataUrl) {
  return cropRegion(dataUrl, CIN_CROP);
}

/** Contraste léger pour Tesseract */
export function enhanceForOcr(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      try {
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var id = ctx.getImageData(0, 0, c.width, c.height);
        var d = id.data;
        for (var i = 0; i < d.length; i += 4) {
          var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          var v = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(id, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.92));
      } catch (e) { resolve(dataUrl); }
    };
    img.onerror = function() { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

function measureImageAspect(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      resolve(img.width / Math.max(img.height, 1));
    };
    img.onerror = function() { resolve(0); };
    img.src = dataUrl;
  });
}

export async function preprocessForOcr(dataUrl, side = 'recto') {
  try {
    var ratio = await measureImageAspect(dataUrl);
    var isCardShape = ratio > 1.42 && ratio < 1.75;
    var base = dataUrl;
    if (!isCardShape) {
      try { base = await cropCINRegion(dataUrl); } catch (_) { /* déjà recadré */ }
    } else if (side === 'verso') {
      // Verso : garder la carte entière (MRZ en bas, hors cadre central)
      base = dataUrl;
    }
    var compressed = await compressImage(base, isMobileDevice() ? 2200 : 2800, 0.92);
    return await enhanceForOcr(compressed);
  } catch (_) {
    try {
      return await compressImage(dataUrl, 2000, 0.90);
    } catch (e2) {
      return dataUrl;
    }
  }
}

export function isImageDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

export function compressImage(dataUrl, maxWidth, quality) {
  maxWidth = maxWidth || 2400;
  quality = quality || 0.92;
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      try {
        var scale = Math.min(1, maxWidth / Math.max(img.width, 1));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (e) { reject(e); }
    };
    img.onerror = function() { reject(new Error('Image non chargeable.')); };
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

async function prepareSide(source, file, sideLabel, fullDataUrl) {
  if (fullDataUrl && isImageDataUrl(String(fullDataUrl))) {
    const dataUrl = await normalizeImageInput(fullDataUrl);
    const preview = isImageDataUrl(source) ? source : dataUrl;
    return { file: null, dataUrl, preview, fullDataUrl: dataUrl };
  }
  if (file instanceof File && file.size > 0) {
    console.info('[OCR CIN] mobile capture file', {
      side: sideLabel,
      name: file.name,
      type: file.type || '(vide)',
      size: file.size,
    });
    const ocrDataUrl = await readFileAsDataUrl(file);
    const preview = isImageDataUrl(source) ? source : ocrDataUrl;
    console.info('[OCR CIN] using original/cropped file', {
      side: sideLabel,
      ocrBytes: file.size,
      previewCropped: preview !== ocrDataUrl,
      ocrSource: 'original-file',
      displaySource: 'cropped-preview',
    });
    console.info('[OCR CIN] image reçue', sideLabel, {
      from: 'file',
      bytes: file.size,
      previewSeparate: preview !== ocrDataUrl,
    });
    return { file, dataUrl: ocrDataUrl, preview, fullDataUrl: ocrDataUrl };
  }

  if (!source) throw new Error(`${sideLabel === 'recto' ? 'Image recto' : 'Image'} requise.`);
  const kind = isImageDataUrl(String(source)) ? 'dataUrl' : String(source).startsWith('http') ? 'url' : 'unknown';
  console.info('[OCR CIN] image reçue', sideLabel, { from: kind, len: String(source).length });
  const dataUrl = await normalizeImageInput(source);
  return { file: null, dataUrl, preview: isImageDataUrl(source) ? source : dataUrl, fullDataUrl: dataUrl };
}

function sideHasExtractedData(mapped, side) {
  if (!mapped) return false;
  if (side === 'verso') {
    return Boolean(
      (mapped.adresse && String(mapped.adresse).trim())
      || (mapped.ville_adresse && String(mapped.ville_adresse).trim())
      || (mapped.nom && String(mapped.nom).trim())
      || (mapped.prenom && String(mapped.prenom).trim())
      || (mapped.numero_cin && String(mapped.numero_cin).trim()),
    );
  }
  return Boolean(
    (mapped.numero_cin && String(mapped.numero_cin).trim())
    || (mapped.prenom && String(mapped.prenom).trim())
    || (mapped.nom && String(mapped.nom).trim())
    || (mapped.date_naissance && String(mapped.date_naissance).trim()),
  );
}

async function normalizeImageInput(source) {
  if (!source) throw new Error('Image recto requise.');
  let dataUrl = source;
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    const blob = await res.blob();
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  if (!isImageDataUrl(String(dataUrl))) throw new Error('Format invalide.');
  try {
    return await compressImage(dataUrl, 2400, 0.90);
  } catch (_) {
    return dataUrl;
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function ocrImageText(dataUrl, psm) {
  var timeoutMs = isMobileDevice() ? 45000 : 60000;
  var opts = { logger: function() {} };
  if (psm != null) opts.tessedit_pageseg_mode = String(psm);

  try {
    var worker = await getOcrWorker();
    if (psm != null) {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
    }
    var job = worker.recognize(dataUrl);
    var timer = new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('OCR Tesseract timeout')); }, timeoutMs);
    });
    var result = await Promise.race([job, timer]);
    return (result.data && result.data.text) || '';
  } catch (workerErr) {
    _tesseractWorkerPromise = null;
    _tesseractWorker = null;
    var T = await loadTesseract();
    var job = T.recognize(dataUrl, 'fra+eng', opts);
    var timer = new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('OCR Tesseract timeout')); }, timeoutMs);
    });
    var result = await Promise.race([job, timer]);
    return (result.data && result.data.text) || '';
  }
}

async function fetchMindeeSides(rectoSide, versoSide) {
  const apiUrl = getOcrApiUrl();
  const rectoRaw = rectoSide?.fullDataUrl || rectoSide?.dataUrl || null;
  const versoRaw = versoSide?.fullDataUrl || versoSide?.dataUrl || null;

  const rectoImg = rectoRaw ? await compressForMindeeApi(rectoRaw) : null;
  const versoImg = versoRaw ? await compressForMindeeApi(versoRaw) : null;
  const backendErrors = [];

  const payloadKb = {
    recto: rectoImg ? Math.round(String(rectoImg).length * 3 / 4 / 1024) : 0,
    verso: versoImg ? Math.round(String(versoImg).length * 3 / 4 / 1024) : 0,
  };
  console.info('[OCR CIN] POST /api/ocr/moroccan-cin (clé Mindee côté serveur uniquement)', {
    apiUrl,
    endpoint: `${apiUrl}/ocr/moroccan-cin`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    recto_sent: Boolean(rectoImg),
    verso_sent: Boolean(versoImg),
    recto_payload_kb: payloadKb.recto,
    verso_payload_kb: payloadKb.verso,
    approxKb: Math.round(estimatePayloadBytes(rectoImg, versoImg) / 1024),
    image_source: 'fullDataUrl (image pleine cadre, pas preview crop)',
  });

  if (!rectoImg && !versoImg) {
    return { recto: null, verso: null, backendErrors: ['Aucune image à envoyer à Mindee'] };
  }

  let rectoData = null;
  let versoData = null;

  function recordFail(result) {
    if (result && !result.ok && result.error) backendErrors.push(result.error);
  }

  let lastDiagnostics = null;

  function captureDiag(res) {
    if (res?.ok && res.json?.diagnostics) lastDiagnostics = res.json.diagnostics;
    if (!res?.ok && res?.report) lastDiagnostics = res.report;
  }

  const combinedKb = estimatePayloadBytes(rectoImg, versoImg);
  if (combinedKb <= 3_200_000 && rectoImg && versoImg) {
    const res = await postMindeeCin(apiUrl, { recto: rectoImg, verso: versoImg }, 'recto+verso');
    captureDiag(res);
    if (res.ok) {
      rectoData = res.json.recto || null;
      versoData = res.json.verso || null;
      if (res.json.diagnostics) lastDiagnostics = res.json.diagnostics;
      if (res.json.audit) lastDiagnostics = { ...lastDiagnostics, server_audit: res.json.audit };
      if (res.json.mindee_http_called != null) {
        lastDiagnostics = { ...lastDiagnostics, mindee_http_called: res.json.mindee_http_called };
      }
    } else {
      recordFail(res);
      if (res.json?.diagnostics) lastDiagnostics = res.json.diagnostics;
      if (res.json?.audit) lastDiagnostics = { ...lastDiagnostics, server_audit: res.json.audit };
      if (res.json?.mindee_http_called != null) {
        lastDiagnostics = { ...lastDiagnostics, mindee_http_called: res.json.mindee_http_called };
      }
    }
  }

  if (!rectoData && rectoImg) {
    const res = await postMindeeCin(apiUrl, { recto: rectoImg }, 'recto');
    captureDiag(res);
    if (res.ok && res.json?.recto) rectoData = res.json.recto;
    else {
      recordFail(res);
      if (res.json?.diagnostics) lastDiagnostics = res.json.diagnostics;
    }
  }
  if (!versoData && versoImg) {
    const res = await postMindeeCin(apiUrl, { verso: versoImg }, 'verso');
    captureDiag(res);
    if (res.ok && res.json?.verso) versoData = res.json.verso;
    else {
      recordFail(res);
      if (res.json?.diagnostics) lastDiagnostics = res.json.diagnostics;
    }
  }

  const uniqueErrorsFinal = [...new Set(backendErrors)];

  const mindeeRectoOk = Boolean(rectoData?.fields && Object.keys(rectoData.fields).length);
  const mindeeVersoOk = !versoImg || Boolean(versoData?.fields && Object.keys(versoData.fields).length);

  if (!mindeeRectoOk && !mindeeVersoOk) {
    return {
      recto: null,
      verso: null,
      backendErrors: uniqueErrorsFinal,
      diagnostics: lastDiagnostics,
      provider_final: 'tesseract',
      mindee_recto_ok: false,
      mindee_verso_ok: false,
      mindee_http_called: lastDiagnostics?.mindee_http_called ?? false,
      payload_kb: payloadKb,
    };
  }

  const providerFinal = mindeeRectoOk && mindeeVersoOk ? 'mindee' : 'mindee_partial';
  console.info('[OCR CIN] Mindee response OK', {
    provider_final: providerFinal,
    mindee_recto_ok: mindeeRectoOk,
    mindee_verso_ok: mindeeVersoOk,
    endpoint: lastDiagnostics?.endpoint_used || lastDiagnostics?.endpoint,
    key_type: lastDiagnostics?.key_type,
    has_MINDEE_MODEL_ID: lastDiagnostics?.has_MINDEE_MODEL_ID,
  });
  if (rectoData?.fields) console.info('[OCR CIN] mindee raw client', { side: 'recto', field_keys: Object.keys(rectoData.fields) });
  if (versoData?.fields) console.info('[OCR CIN] mindee raw client', { side: 'verso', field_keys: Object.keys(versoData.fields) });

  return {
    recto: rectoData,
    verso: versoData,
    backendErrors: uniqueErrorsFinal,
    diagnostics: lastDiagnostics,
    provider_final: providerFinal,
    mindee_recto_ok: mindeeRectoOk,
    mindee_verso_ok: mindeeVersoOk,
    mindee_http_called: lastDiagnostics?.mindee_http_called ?? null,
    server_audit: null,
    payload_kb: payloadKb,
  };
}

/** Résout le payload Mindee d'un côté (fields prioritaire, sinon raw extrait). */
function resolveMindeeSidePayload(sideData) {
  if (!sideData) return null;
  const fields = sideData.fields;
  if (fields && typeof fields === 'object' && !Array.isArray(fields) && Object.keys(fields).length > 0) {
    return fields;
  }
  const raw = sideData.raw || sideData;
  const extracted = extractMindeeFields(raw);
  if (extracted && Object.keys(extracted).length > 0) return extracted;
  return null;
}

function parseMindeeSide(payload, side) {
  const fields = extractMindeeFields(payload);
  const mapped = mapMindeeFields(fields, side);
  return { mapped, fields, source: 'mindee' };
}

function getMissingTargets(mapped, side) {
  var m = { ...emptyCINExtract(), ...(mapped || {}) };
  return {
    prenom: !String(m.prenom || '').trim(),
    nom: !String(m.nom || '').trim(),
    cin: !String(m.numero_cin || '').trim(),
    dateNaissance: !String(m.date_naissance || '').trim(),
    dateExpiration: !String(m.date_expiration || '').trim(),
    adresse: side === 'verso' && (!String(m.adresse || '').trim() || String(m.adresse).length < 10),
  };
}

/** Verso : toujours OCR profond (MRZ + adresse). Recto : si identité incomplète. */
function sideNeedsDeepOcr(mapped, side) {
  if (side === 'verso') return true;
  return needsOcrFallback(mapped, side);
}

function targetsNeedOcr(targets) {
  return targets.prenom || targets.nom || targets.cin || targets.dateNaissance
    || targets.dateExpiration || targets.adresse;
}

function allVersoTargets() {
  return { prenom: true, nom: true, cin: true, dateNaissance: true, dateExpiration: true, adresse: true };
}

function needsOcrFallback(mapped, side) {
  var m = { ...emptyCINExtract(), ...(mapped || {}) };
  if (side === 'recto') {
    return !identityFieldsComplete(m)
      || !String(m.date_naissance || '').trim()
      || !String(m.date_expiration || '').trim();
  }
  return targetsNeedOcr(getMissingTargets(m, side));
}

function buildTesseractPlan(side, targets) {
  var plans = [];
  if (side === 'recto') {
    if (targets.nom || targets.prenom) plans.push({ crop: NAMES_CROP, label: 'names' });
    if (targets.dateNaissance) plans.push({ crop: BIRTH_CROP, label: 'birth' });
    plans.push({ crop: CIN_CROP, label: 'card' });
  } else {
    plans.push({ crop: MRZ_CROP, label: 'mrz' });
    if (targets.adresse) plans.push({ crop: VERSO_ADDRESS_CROP, label: 'address' });
    plans.push({ crop: null, label: 'full' });
  }
  return plans;
}

/** Concatène les champs MRZ Mindee pour le parseur texte. */
function collectMindeeMrzText(sideData) {
  const payload = resolveMindeeSidePayload(sideData);
  if (!payload) return '';
  const parts = [];
  for (const [key, val] of Object.entries(payload)) {
    if (/mrz/i.test(key)) {
      const v = pickMindeeValue(val);
      if (v) parts.push(v);
    }
  }
  return parts.join('\n');
}

async function parseTesseractSide(imageDataUrl, side, seedMapped) {
  var bestMapped = { ...emptyCINExtract(), ...(seedMapped || {}) };
  var targets = side === 'verso' ? allVersoTargets() : getMissingTargets(bestMapped, side);
  if (side !== 'verso' && !targetsNeedOcr(targets)) {
    return { mapped: bestMapped, fields: null, source: 'none', rawText: '' };
  }

  var plans = buildTesseractPlan(side, targets);
  var textParts = [];
  var bestText = '';

  for (var pi = 0; pi < plans.length; pi++) {
    targets = getMissingTargets(bestMapped, side);
    if (!targetsNeedOcr(targets)) break;

    var img;
    try {
      img = await prepareOcrImage(imageDataUrl, plans[pi].crop, plans[pi].label);
    } catch (_) { continue; }

    var psms = plans[pi].label === 'mrz' ? [7, 6, 11, 13] : [6, 3];
    for (var psi = 0; psi < psms.length; psi++) {
      try {
        var text = await ocrImageText(img, psms[psi]);
        if (!text || text.length < 4) continue;
        textParts.push(text);
        bestText = textParts.join('\n');
        var passMapped = mapTesseractText(bestText, side);
        bestMapped = mergeSideExtracts(bestMapped, passMapped, side);
        targets = getMissingTargets(bestMapped, side);
        if (!targetsNeedOcr(targets)) break;
        if (psi === 0 && (targets.prenom || targets.nom) && plans[pi].label === 'mrz') {
          continue;
        }
      } catch (err) {
        console.warn('[OCR CIN] Tesseract', side, plans[pi].label, psms[psi], err?.message || err);
      }
    }
  }

  if (textParts.length > 1) {
    var combinedMapped = mapTesseractText(textParts.join('\n'), side);
    bestMapped = mergeSideExtracts(bestMapped, combinedMapped, side);
    bestText = textParts.join('\n');
  }

  return {
    mapped: bestMapped,
    fields: null,
    source: textParts.length ? 'tesseract' : 'none',
    rawText: bestText,
  };
}

async function analyzeSide(imageDataUrl, mindeeSideData, side, opts) {
  var mindeeActive = opts?.mindeeActive !== false;
  var mindeeMapped = emptyCINExtract();
  var hasMindee = false;

  const payload = mindeeActive ? resolveMindeeSidePayload(mindeeSideData) : null;
  if (payload) {
    const result = parseMindeeSide(payload, side);
    console.info('[OCR CIN] mindee raw', { side, fields: result.fields });
    mindeeMapped = result.mapped;
    hasMindee = sideHasExtractedData(mindeeMapped, side);
    if (hasMindee) {
      console.info('[OCR CIN] mapped result', { side, source: 'mindee', mapped: mindeeMapped });
    }
  }

  var tessResult = { mapped: emptyCINExtract(), rawText: '', source: 'none' };
  var runTess = !payload;
  if (!payload) {
    console.warn('[OCR CIN] Mindee non utilisé — fallback Tesseract', { side });
  }
  if (payload && hasMindee) {
    if (side === 'verso') {
      runTess = true;
    } else if (identityFieldsComplete(mindeeMapped)) {
      var dateTargets = getMissingTargets(mindeeMapped, 'recto');
      runTess = dateTargets.dateNaissance || dateTargets.dateExpiration;
    } else {
      var rectoTargets = getMissingTargets(mindeeMapped, 'recto');
      var prenomUp = String(mindeeMapped.prenom || '').trim().toUpperCase();
      var nomUp = String(mindeeMapped.nom || '').trim().toUpperCase();
      var prenomLooksWrong = prenomUp && nomUp && prenomUp === nomUp;
      var prenomValid = isValidPersonName(mindeeMapped.prenom, true);
      var nomValid = isValidPersonName(mindeeMapped.nom, false);
      runTess = (rectoTargets.prenom && !prenomValid)
        || (rectoTargets.nom && !nomValid)
        || prenomLooksWrong
        || rectoTargets.cin
        || rectoTargets.dateNaissance
        || rectoTargets.dateExpiration;
    }
  }

  if (runTess) {
    var tessReason = payload
      ? (side === 'verso' ? 'complément verso (adresse/MRZ)' : 'complément recto (prénom/nom)')
      : 'fallback — Mindee absent';
    console.info('[OCR CIN] provider=tesseract', side, tessReason);
    try {
      var tessInput = imageDataUrl;
      try { tessInput = await preprocessForOcr(imageDataUrl, side); } catch (_) { /* full frame */ }
      tessResult = await parseTesseractSide(tessInput, side, hasMindee ? mindeeMapped : emptyCINExtract());
      if (tessResult.rawText) {
        console.info('[OCR CIN] raw result', { side, source: 'tesseract', text: tessResult.rawText.slice(0, 300) });
      }
    } catch (err) {
      console.error('[OCR CIN] Tesseract échec', side, err);
    }
  }

  var merged = hasMindee ? mindeeMapped : tessResult.mapped;
  if (hasMindee && tessResult.source === 'tesseract') {
    merged = mergeSideExtracts(mindeeMapped, tessResult.mapped, side);
  }

  var source = 'none';
  if (hasMindee && tessResult.source === 'tesseract') source = 'mindee+tesseract';
  else if (hasMindee) source = 'mindee';
  else if (tessResult.source === 'tesseract') source = 'tesseract';

  console.info('[OCR CIN] mapped result', { side, source, mapped: merged });
  return { mapped: merged, mindeeMapped, tessMapped: tessResult.mapped, source, rawText: tessResult.rawText || '' };
}

/**
 * Analyse CIN recto (+ verso optionnel) → champs formulaire Ouvrier.
 * @param {string} rectoSource — preview dataUrl ou URL (affichage)
 * @param {string|null} versoSource
 * @param {{ rectoFile?: File, versoFile?: File }} [options] — fichiers originaux pour OCR
 */
export async function scanCIN(rectoSource, versoSource, options = {}) {
  const { rectoFile, versoFile, rectoFullDataUrl, versoFullDataUrl, onProgress } = options;
  const progress = typeof onProgress === 'function' ? onProgress : function() {};
  const debug = isOcrDebugEnabled();

  progress('Préparation des images…');
  preloadOcrEngine();

  const [rectoStats, versoStats] = await Promise.all([
    describeDataUrlStats(rectoFullDataUrl || rectoSource, 'recto'),
    (versoSource || versoFullDataUrl) ? describeDataUrlStats(versoFullDataUrl || versoSource, 'verso') : Promise.resolve({ label: 'verso', present: false }),
  ]);
  if (debug) console.info('[OCR CIN] DEBUG images', { recto: rectoStats, verso: versoStats });

  const rectoSide = await prepareSide(rectoSource, rectoFile, 'recto', rectoFullDataUrl);
  let versoSide = null;
  if (versoSource || versoFile || versoFullDataUrl) {
    try {
      versoSide = await prepareSide(versoSource, versoFile, 'verso', versoFullDataUrl);
    } catch (err) {
      console.warn('[OCR CIN] verso ignoré', err.message);
      versoSide = null;
    }
  }

  progress('Analyse Mindee…');
  const mindeePromise = fetchMindeeSides(rectoSide, versoSide);
  const workerWarmup = getOcrWorker().catch(function() { return null; });
  const [mindeeResult] = await Promise.all([mindeePromise, workerWarmup]);
  const mindee = mindeeResult || { recto: null, verso: null, backendErrors: [], diagnostics: null };
  const mindeeRectoOk = Boolean(
    mindee.mindee_recto_ok
    ?? (mindee.recto?.fields && Object.keys(mindee.recto.fields).length > 0),
  );
  const mindeeVersoOk = !versoSide || Boolean(
    mindee.mindee_verso_ok
    ?? (mindee.verso?.fields && Object.keys(mindee.verso.fields).length > 0),
  );
  const hasMindee = mindeeRectoOk;
  const mindeeFull = mindeeRectoOk && mindeeVersoOk;
  let providerUsed = mindeeFull ? 'mindee' : (mindeeRectoOk ? 'mindee_partial' : 'tesseract');

  if (mindee.diagnostics) {
    console.info('[OCR CIN] Mindee diagnostics', mindee.diagnostics);
  }
  if (!mindeeRectoOk) {
    console.warn('[OCR CIN] Mindee non utilisé — fallback Tesseract', {
      provider_final: mindee.provider_final || providerUsed,
      mindee_recto_ok: mindeeRectoOk,
      mindee_verso_ok: mindeeVersoOk,
      endpoint: mindee.diagnostics?.endpoint_used || mindee.diagnostics?.endpoint,
      key_type: mindee.diagnostics?.key_type,
      has_MINDEE_MODEL_ID: mindee.diagnostics?.has_MINDEE_MODEL_ID,
      errors: mindee.backendErrors,
    });
    providerUsed = 'tesseract';
  } else if (providerUsed === 'mindee_partial') {
    console.info('[OCR CIN] OCR provider utilisé = mindee_partial (recto Mindee, complément Tesseract verso)', {
      endpoint: mindee.diagnostics?.endpoint_used || mindee.diagnostics?.endpoint,
      mindee_recto_ok: mindeeRectoOk,
      mindee_verso_ok: mindeeVersoOk,
    });
  } else {
    console.info('[OCR CIN] OCR provider utilisé = mindee', {
      endpoint: mindee.diagnostics?.endpoint_used || mindee.diagnostics?.endpoint,
      mindee_recto_ok: mindeeRectoOk,
      mindee_verso_ok: mindeeVersoOk,
    });
  }
  if (!mindeeRectoOk && mindee.backendErrors?.length) {
    console.error('[OCR CIN] Mindee échec (erreur exacte):', mindee.backendErrors.join(' | '));
  }

  progress(hasMindee ? 'Extraction Mindee…' : 'Lecture Tesseract (local)…');

  // OCR sur images originales (dataUrl) — pas la version prétraitée seule
  const rectoOcrSrc = rectoSide.dataUrl;
  const versoOcrSrc = versoSide?.dataUrl || null;

  const rectoPromise = analyzeSide(rectoOcrSrc, mindeeRectoOk ? (mindee?.recto || null) : null, 'recto', { mindeeActive: mindeeRectoOk });
  const versoPromise = versoOcrSrc
    ? analyzeSide(versoOcrSrc, mindeeVersoOk ? (mindee?.verso || null) : null, 'verso', { mindeeActive: mindeeVersoOk })
    : Promise.resolve({ mapped: emptyCINExtract(), mindeeMapped: emptyCINExtract(), tessMapped: emptyCINExtract(), source: 'none', rawText: '' });

  const [rectoResult, versoResult] = await Promise.all([rectoPromise, versoPromise]);

  progress('Finalisation identité…');

  const mrzRecto = collectMindeeMrzText(mindee?.recto);
  const mrzVerso = collectMindeeMrzText(mindee?.verso);
  const identityTextParts = [];
  if (rectoResult.rawText) identityTextParts.push(rectoResult.rawText);
  if (versoResult.rawText) identityTextParts.push(versoResult.rawText);
  if (mrzRecto) identityTextParts.push(mrzRecto);
  if (mrzVerso) identityTextParts.push(mrzVerso);
  const combinedText = identityTextParts.join('\n');

  let baseMerged = mergeCINRectoVerso(rectoResult.mapped, versoResult.mapped);
  let merged = resolveCINIdentity({
    base: baseMerged,
    extracts: [
      rectoResult.mindeeMapped,
      rectoResult.mapped,
      rectoResult.tessMapped,
      versoResult.mindeeMapped,
      versoResult.mapped,
      versoResult.tessMapped,
    ],
    rectoExtracts: [
      rectoResult.mindeeMapped,
      rectoResult.mapped,
      rectoResult.tessMapped,
    ],
    combinedText,
    rectoText: rectoResult.rawText || '',
    versoText: versoResult.rawText || '',
    versoExtracts: [
      versoResult.mindeeMapped,
      versoResult.mapped,
      versoResult.tessMapped,
    ],
    mindeeRectoFields: mindeeRectoOk ? (mindee?.recto?.fields || null) : null,
    mindeeVersoFields: mindeeVersoOk ? (mindee?.verso?.fields || null) : null,
    mindeeRectoActive: mindeeRectoOk,
    mindeeVersoActive: mindeeVersoOk,
  });

  console.info('[OCR CIN] identity resolved', { nom: merged.nom, prenom: merged.prenom, cin: merged.numero_cin });

  const usesTesseractComplement = rectoResult.source === 'mindee+tesseract' || versoResult.source === 'mindee+tesseract';
  if (hasMindee && usesTesseractComplement) {
    console.info('[OCR CIN] Complément Tesseract (MRZ / adresse) — provider principal = mindee');
  }

  const formData = mapToWorkerForm({ ...merged, provider: providerUsed });

  console.info('[OCR CIN] final form data', formData);
  console.info('[OCR CIN] OCR provider utilisé = ' + providerUsed);

  const backendErrorText = !hasMindee && mindee.backendErrors?.length
    ? mindee.backendErrors.join(' — ')
    : '';

  const debugReport = debug ? {
    provider_used: providerUsed,
    mindee_endpoint: mindee.diagnostics?.endpoint || null,
    mindee_diagnostics: mindee.diagnostics || null,
    images: { recto: rectoStats, verso: versoStats },
    mindee_raw: {
      recto: mindee.recto?.fields || mindee.recto?.raw || null,
      verso: mindee.verso?.fields || mindee.verso?.raw || null,
    },
    ocr_text: {
      recto: rectoResult.rawText || '',
      verso: versoResult.rawText || '',
      mrz_recto: mrzRecto,
      mrz_verso: mrzVerso,
    },
    mapped: {
      recto: rectoResult.mapped,
      verso: versoResult.mapped,
      merged,
      form: formData,
    },
    backend_errors: mindee.backendErrors || [],
  } : null;

  if (debugReport) {
    console.info('[OCR CIN] DEBUG rapport complet', debugReport);
  }

  const auditReport = buildOcrAuditReport({
    client_api_base: getOcrApiUrl(),
    client_api_endpoint: `${getOcrApiUrl()}/ocr/moroccan-cin`,
    diagnostics: mindee.diagnostics,
    mindee_config_blocked: mindee.diagnostics?.model_id_required && !mindee.diagnostics?.has_MINDEE_MODEL_ID,
    config_error: mindee.backendErrors?.find((e) => e.includes('MINDEE_MODEL_ID')) || null,
    mindee_http_called: mindee.mindee_http_called ?? mindee.diagnostics?.mindee_http_called ?? false,
    mindee_recto_ok: mindeeRectoOk,
    mindee_verso_ok: mindeeVersoOk,
    verso_required: Boolean(versoSide),
    provider_final: providerUsed,
    backend_errors: mindee.backendErrors || [],
    mindee_raw_recto: mindee.recto?.fields || null,
    mindee_raw_verso: mindee.verso?.fields || null,
    image_stats_recto: rectoStats,
    image_stats_verso: versoStats,
    mindee_payload_recto_kb: mindee.payload_kb?.recto,
    mindee_payload_verso_kb: mindee.payload_kb?.verso,
    ocr_image_source_recto: rectoFullDataUrl ? 'fullDataUrl' : (rectoFile ? 'file' : 'preview'),
    ocr_image_source_verso: versoFullDataUrl ? 'fullDataUrl' : (versoFile ? 'file' : 'preview'),
    preview_cropped_recto: rectoSide.preview !== rectoSide.dataUrl,
    preview_cropped_verso: versoSide ? versoSide.preview !== versoSide.dataUrl : null,
    tesseract_text_recto: rectoResult.rawText,
    tesseract_text_verso: versoResult.rawText,
    mrz_recto: mrzRecto,
    mrz_verso: mrzVerso,
    mapped_recto: rectoResult.mapped,
    mapped_verso: versoResult.mapped,
    mapped_merged: merged,
    final_form: formData,
    recto_side_source: rectoResult.source,
    verso_side_source: versoResult.source,
    prenom_resolution_source: merged._prenom_resolution_source || null,
    adresse_resolution_source: merged._adresse_resolution_source || null,
  });
  logOcrAuditReport(auditReport);

  let warning = buildOcrWarning(
    formData,
    Boolean(rectoResult.mapped?.numero_cin || rectoResult.mapped?.prenom || rectoResult.source),
    Boolean(versoResult.mapped?.adresse || versoSide),
  );
  if (providerUsed === 'tesseract') {
    const tessMsg = 'Mindee non utilisé — fallback Tesseract.';
    warning = warning ? tessMsg + ' ' + warning : tessMsg;
    if (backendErrorText) warning += ' (' + backendErrorText + ')';
  } else if (providerUsed === 'mindee_partial' && !mindeeVersoOk) {
    const partialMsg = 'Identité via Mindee — adresse/MRZ verso via Tesseract (moins fiable).';
    warning = warning ? partialMsg + ' ' + warning : partialMsg;
  } else if (backendErrorText) {
    const prefix = 'Mindee : ' + backendErrorText;
    warning = warning ? prefix + ' — ' + warning : prefix;
  }

  return {
    ...formData,
    cin_recto: rectoSide.preview || rectoSide.dataUrl,
    cin_verso: versoSide ? (versoSide.preview || versoSide.dataUrl) : '',
    _ocr_source: providerUsed,
    _ocr_provider_used: providerUsed,
    _ocr_backend_error: backendErrorText || null,
    _ocr_warning: warning,
    _ocr_partial: Boolean(warning),
    _ocr_debug: debugReport,
    _ocr_audit: auditReport,
  };
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && window.innerWidth <= 768);
}

export function canUseCamera() {
  if (typeof navigator === 'undefined') return false;
  if (typeof window !== 'undefined' && !window.isSecureContext) return false;
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

/** Flux caméra arrière HD — à appeler depuis un clic utilisateur (requis iOS Safari). */
export async function getCINCameraStream() {
  if (!canUseCamera()) {
    throw new Error(getCameraBlockedReason());
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
  } catch (firstErr) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
    } catch (secondErr) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch {
        throw firstErr;
      }
    }
  }
}

/** Message si caméra bloquée (HTTP sur iPhone, permissions, etc.) */
export function getCameraBlockedReason() {
  if (typeof window === 'undefined') return 'Caméra indisponible.';
  if (!window.isSecureContext) {
    return 'Sur iPhone, la caméra custom requiert HTTPS (pas HTTP). Ouvrez l’URL https:// affichée au démarrage du serveur, ou importez depuis la galerie.';
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'Caméra non supportée par ce navigateur.';
  return 'Accès caméra refusé. Autorisez la caméra ou importez depuis la galerie.';
}

/** Message précis selon l’erreur getUserMedia (NotAllowedError, etc.). */
export function getCameraErrorMessage(err) {
  const name = err?.name || '';
  const msg = String(err?.message || '');
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(msg)) {
    return 'Caméra refusée. Cliquez sur l’icône cadenas / « i » dans la barre d’adresse → Autoriser la caméra → « Réessayer la caméra ». Sinon : Galerie.';
  }
  if (name === 'NotFoundError' || /not found|no device/i.test(msg)) {
    return 'Aucune caméra détectée. Importez une photo JPG/PNG depuis la galerie.';
  }
  if (name === 'NotReadableError' || /could not start|in use/i.test(msg)) {
    return 'Caméra occupée par une autre application. Fermez l’autre app, puis réessayez.';
  }
  if (name === 'OverconstrainedError') {
    return 'Réglages caméra non supportés — réessayez ou utilisez la galerie.';
  }
  if (name === 'AbortError') {
    return 'Activation caméra annulée.';
  }
  if (msg && msg.length < 200) return msg;
  return getCameraBlockedReason();
}

export { mapMindeeFields, mergeCINRectoVerso, mapToWorkerForm, resolveCINIdentity } from './cinOcr';
