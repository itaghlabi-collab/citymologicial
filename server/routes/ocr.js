/**
 * CITYMO ERP – OCR Route (proxy vers service Python OpenCV/PaddleOCR)
 * POST /api/ocr/moroccan-cin
 *
 * OCR_SERVICE_URL=http://localhost:8000  (service ocr-service/)
 * Aucune dépendance Mindee.
 */
'use strict';

const express = require('express');
const multer = require('multer');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(name)) {
      return cb(null, true);
    }
    cb(new Error('Seules les images sont acceptées (jpeg, png, webp).'));
  },
});

const OCR_SERVICE_URL = (process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 90000);

function mapToLegacyClientShape(result) {
  if (!result || result.ok === false) {
    return {
      ok: false,
      error: result?.error || 'Service OCR indisponible',
      error_code: result?.error_code || 'OCR_UNAVAILABLE',
      _ocr_warning: result?.error || 'Service OCR indisponible',
      allow_force: result?.allow_force !== false,
      quality_recto: result?.quality_recto,
      quality_verso: result?.quality_verso,
      progress: result?.progress || [],
      provider: 'citymo',
    };
  }

  const wf = result.worker_form || {};
  return {
    ok: true,
    partial: !!result.partial,
    cin: wf.cin || '',
    prenom: wf.prenom || '',
    nom: wf.nom || '',
    date_naissance: wf.date_naissance || '',
    ville_naissance: wf.ville_naissance || '',
    nationalite: wf.nationalite || 'Marocaine',
    sexe: wf.sexe || '',
    date_expiration: wf.date_expiration || '',
    nom_arabe: wf.nom_arabe || '',
    prenom_arabe: wf.prenom_arabe || '',
    fields: result.fields || {},
    confidence_globale: result.confidence_globale,
    recto: result.recto,
    verso: result.verso,
    identical_faces: result.identical_faces,
    warnings: result.warnings || [],
    progress: result.progress || [],
    engine_name: result.engine_name,
    engine_version: result.engine_version,
    engine_used: result.engine_used,
    duration_ms: result.duration_ms,
    provider: 'citymo',
    _ocr_provider_used: result.engine_used || 'citymo',
    _ocr_warning: (result.warnings || []).join(' — '),
    _ocr_partial: !!result.partial,
  };
}

async function forwardJson(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch(`${OCR_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: 'Service OCR indisponible', error_code: 'OCR_UNAVAILABLE' };
    }
    if (!res.ok && !data.error) {
      data = {
        ok: false,
        error: data.detail || `OCR HTTP ${res.status}`,
        error_code: res.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'OCR_UNAVAILABLE',
      };
    }
    return data;
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    return {
      ok: false,
      error: timedOut ? 'Temps d\'analyse dépassé' : 'Service OCR indisponible',
      error_code: timedOut ? 'OCR_TIMEOUT' : 'OCR_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timer);
  }
}

function bufferToDataUrl(buf, mime) {
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime || 'image/jpeg'};base64,${b64}`;
}

router.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${OCR_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    return res.json({ ok: true, proxy: true, ocr_service: data, ocr_service_url: OCR_SERVICE_URL });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      proxy: true,
      error: 'Service OCR indisponible',
      ocr_service_url: OCR_SERVICE_URL,
    });
  }
});

router.post('/moroccan-cin', upload.fields([
  { name: 'recto', maxCount: 1 },
  { name: 'verso', maxCount: 1 },
]), async (req, res) => {
  try {
    let recto = null;
    let verso = null;
    const force = req.body?.force === true || req.body?.force === 'true' || req.query?.force === '1';

    if (req.files?.recto?.[0]) {
      recto = bufferToDataUrl(req.files.recto[0].buffer, req.files.recto[0].mimetype);
    }
    if (req.files?.verso?.[0]) {
      verso = bufferToDataUrl(req.files.verso[0].buffer, req.files.verso[0].mimetype);
    }

    if (!recto && typeof req.body?.recto === 'string') recto = req.body.recto;
    if (!verso && typeof req.body?.verso === 'string') verso = req.body.verso;

    // JSON body (Vite / fetch)
    if (!recto && req.is('application/json') && req.body) {
      recto = req.body.recto || null;
      verso = req.body.verso || null;
    }

    if (!recto) {
      return res.status(400).json({
        ok: false,
        error: 'Recto manquant',
        error_code: 'RECTO_MISSING',
        _ocr_warning: 'Recto manquant',
      });
    }

    const raw = await forwardJson({ recto, verso, force });
    const mapped = mapToLegacyClientShape(raw);
    const status = mapped.ok ? 200 : (mapped.error_code === 'IMAGE_UNREADABLE' ? 422 : 503);
    // 422 pour qualité — client peut forcer ; 200 même si partiel
    if (mapped.ok) return res.json(mapped);
    if (mapped.error_code === 'IMAGE_UNREADABLE' || mapped.error_code === 'RECTO_MISSING') {
      return res.status(422).json(mapped);
    }
    if (mapped.error_code === 'OCR_TIMEOUT') {
      return res.status(504).json(mapped);
    }
    return res.status(status).json(mapped);
  } catch (err) {
    console.error('[OCR proxy]', err?.message || err);
    return res.status(503).json({
      ok: false,
      error: 'Service OCR indisponible',
      error_code: 'OCR_UNAVAILABLE',
      _ocr_warning: 'Service OCR indisponible — saisissez les champs manuellement.',
    });
  }
});

module.exports = router;
