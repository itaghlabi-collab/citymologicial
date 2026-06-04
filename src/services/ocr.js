/**
 * ocr.js — Scan CIN marocaine : Mindee (prioritaire) → Tesseract fallback
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
  resolveCINIdentity,
  pickMindeeValue,
} from './cinOcr';

import { CIN_FRAME_MASK as CIN_CROP } from './cinCapture';

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
  const payload = {
    recto: rectoSide?.fullDataUrl || rectoSide?.dataUrl || null,
    verso: versoSide?.fullDataUrl || versoSide?.dataUrl || null,
  };

  console.info('[OCR CIN] POST /api/ocr/moroccan-cin', {
    recto: payload.recto ? 'full-image' : 'none',
    verso: payload.verso ? 'full-image' : 'none',
    apiUrl,
  });

  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, isMobileDevice() ? 50000 : 55000);

  try {
    const res = await fetch(`${apiUrl}/ocr/moroccan-cin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch { json = {}; }
    if (!res.ok || !json.success) {
      const code = json.code || 'OCR_BACKEND_ERROR';
      console.warn('[OCR CIN] Mindee failed, fallback Tesseract', {
        code,
        error: json.error || text.slice(0, 120),
        status: res.status,
      });
      return null;
    }
    console.info('[OCR CIN] Mindee response OK', { recto: !!json.recto, verso: !!json.verso });
    if (json.recto?.fields) console.info('[OCR CIN] mindee raw', { side: 'recto', fields: json.recto.fields });
    if (json.verso?.fields) console.info('[OCR CIN] mindee raw', { side: 'verso', fields: json.verso.fields });
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn('[OCR CIN] Mindee timeout, fallback Tesseract');
      return null;
    }
    console.warn('[OCR CIN] backend indisponible, fallback Tesseract', err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
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

async function analyzeSide(imageDataUrl, mindeeSideData, side) {
  var mindeeMapped = emptyCINExtract();
  var hasMindee = false;

  const payload = resolveMindeeSidePayload(mindeeSideData);
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
  var runTess = !hasMindee || sideNeedsDeepOcr(mindeeMapped, side);

  if (runTess) {
    console.info('[OCR CIN] provider=tesseract', side, hasMindee ? '(complément Mindee)' : '(fallback Mindee indisponible ou vide)');
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
  } else {
    console.info('[OCR CIN] Tesseract ignoré', side, '(Mindee complet)');
  }

  var merged = hasMindee
    ? mergeSideExtracts(mindeeMapped, tessResult.mapped, side)
    : tessResult.mapped;

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

  progress('Préparation des images…');
  preloadOcrEngine();

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
  const [mindee] = await Promise.all([mindeePromise, workerWarmup]);
  const hasMindee = Boolean(mindee?.recto || mindee?.verso);
  console.info('[OCR CIN] provider', hasMindee ? 'mindee' : 'tesseract');

  progress(hasMindee ? 'Extraction Mindee…' : 'Lecture Tesseract (local)…');

  // OCR sur images originales (dataUrl) — pas la version prétraitée seule
  const rectoOcrSrc = rectoSide.dataUrl;
  const versoOcrSrc = versoSide?.dataUrl || null;

  const rectoPromise = analyzeSide(rectoOcrSrc, mindee?.recto || null, 'recto');
  const versoPromise = versoOcrSrc
    ? analyzeSide(versoOcrSrc, mindee?.verso || null, 'verso')
    : Promise.resolve({ mapped: emptyCINExtract(), mindeeMapped: emptyCINExtract(), tessMapped: emptyCINExtract(), source: 'none', rawText: '' });

  const [rectoResult, versoResult] = await Promise.all([rectoPromise, versoPromise]);

  progress('Finalisation identité…');

  const rawTexts = [];
  if (rectoResult.rawText) rawTexts.push(rectoResult.rawText);
  if (versoResult.rawText) rawTexts.push(versoResult.rawText);
  const mrzRecto = collectMindeeMrzText(mindee?.recto);
  const mrzVerso = collectMindeeMrzText(mindee?.verso);
  if (mrzRecto) rawTexts.push(mrzRecto);
  if (mrzVerso) rawTexts.push(mrzVerso);

  let baseMerged = mergeCINRectoVerso(rectoResult.mapped, versoResult.mapped);

  const combinedText = rawTexts.join('\n');
  let merged = resolveCINIdentity({
    base: baseMerged,
    extracts: [
      versoResult.mapped,
      versoResult.tessMapped,
      versoResult.mindeeMapped,
      rectoResult.mapped,
      rectoResult.tessMapped,
      rectoResult.mindeeMapped,
    ],
    combinedText,
  });

  console.info('[OCR CIN] identity resolved', { nom: merged.nom, prenom: merged.prenom, cin: merged.numero_cin });

  const provider = hasMindee && (
    rectoResult.source === 'mindee' || versoResult.source === 'mindee'
  ) ? 'mindee' : 'tesseract';
  const formData = mapToWorkerForm({ ...merged, provider });

  console.info('[OCR CIN] final form data', formData);

  const warning = buildOcrWarning(
    formData,
    Boolean(rectoResult.mapped?.numero_cin || rectoResult.mapped?.prenom || rectoResult.source),
    Boolean(versoResult.mapped?.adresse || versoSide),
  );

  return {
    ...formData,
    cin_recto: rectoSide.preview || rectoSide.dataUrl,
    cin_verso: versoSide ? (versoSide.preview || versoSide.dataUrl) : '',
    _ocr_source: provider,
    _ocr_warning: warning,
    _ocr_partial: Boolean(warning),
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
        facingMode: { exact: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080 },
      },
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
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

export { mapMindeeFields, mergeCINRectoVerso, mapToWorkerForm, resolveCINIdentity } from './cinOcr';
