/**
 * POST /api/workers/cin/analyze
 * Proxy authentifié vers le microservice OCR (OCR_SERVICE_URL).
 * N'expose jamais OCR_SERVICE_URL ni OCR_SERVICE_API_KEY au navigateur.
 */
'use strict';

const express = require('express');
const multer = require('multer');
const { requireSupabaseAuth } = require('../middleware/supabaseAuth');

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
    cb(new Error('UNSUPPORTED_FORMAT'));
  },
});

const OCR_SERVICE_URL = (process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OCR_SERVICE_API_KEY = process.env.OCR_SERVICE_API_KEY || '';
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 90000);

function mapResponse(data) {
  if (!data || data.ok === false || data.success === false) {
    return {
      ok: false,
      success: false,
      error: data?.error || 'Service OCR indisponible',
      error_code: data?.error_code || 'OCR_UNAVAILABLE',
      allow_force: data?.allow_force !== false,
      progress: data?.progress || [],
      warnings: data?.warnings || [],
      provider: 'citymo',
    };
  }

  const fields = data.fields || {};
  const wf = data.worker_form || {};
  // Ne jamais injecter nationalité parasite côté proxy
  const nat = fields.nationalite;
  if (nat && (nat.valid === false || !nat.value || String(nat.value).trim().length <= 2)) {
    fields.nationalite = { value: null, confidence: 0, valid: false, source: null };
    wf.nationalite = null;
  }

  return {
    ok: true,
    success: true,
    fields,
    worker_form: wf,
    cin: wf.cin || null,
    prenom: wf.prenom || null,
    nom: wf.nom || null,
    date_naissance: wf.date_naissance || null,
    ville_naissance: wf.ville_naissance || null,
    nationalite: wf.nationalite || null,
    sexe: wf.sexe || null,
    date_expiration: wf.date_expiration || null,
    nom_arabe: wf.nom_arabe || null,
    prenom_arabe: wf.prenom_arabe || null,
    confidence_globale: data.confidence_globale,
    progress: data.progress || [],
    warnings: data.warnings || [],
    faces: data.faces || {},
    engine_used: data.engine_used,
    engine_version: data.engine_version,
    duration_ms: data.duration_ms,
    partial: !!data.partial,
    provider: 'citymo',
  };
}

async function callOcrJson(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);
  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (OCR_SERVICE_API_KEY) headers['X-API-Key'] = OCR_SERVICE_API_KEY;

    const res = await fetch(`${OCR_SERVICE_URL}/v1/cin/analyze-json`, {
      method: 'POST',
      headers,
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
    if (res.status === 401) {
      return { ok: false, error: 'Clé OCR refusée', error_code: 'OCR_UNAUTHORIZED' };
    }
    if (!res.ok && !data.error_code) {
      data = {
        ok: false,
        error: data.detail?.error || data.error || `OCR HTTP ${res.status}`,
        error_code: data.detail?.error_code || 'OCR_FAILED',
      };
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: "Temps d'analyse dépassé", error_code: 'OCR_TIMEOUT', allow_force: true };
    }
    return { ok: false, error: 'Service OCR indisponible', error_code: 'OCR_UNAVAILABLE', allow_force: true };
  } finally {
    clearTimeout(timer);
  }
}

function bufferToDataUrl(file) {
  if (!file?.buffer) return null;
  const mime = file.mimetype || 'image/jpeg';
  return `data:${mime};base64,${file.buffer.toString('base64')}`;
}

/**
 * Auth: session Supabase (même middleware que backups / admin).
 * Permissions: utilisateur authentifié avec accès ERP (module ouvriers géré côté UI/RLS).
 */
router.post(
  '/cin/analyze',
  requireSupabaseAuth,
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'recto', maxCount: 1 },
    { name: 'verso', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!process.env.OCR_SERVICE_URL && process.env.NODE_ENV === 'production') {
        return res.status(503).json({
          ok: false,
          error: 'OCR non configuré',
          error_code: 'OCR_NOT_CONFIGURED',
        });
      }

      const files = req.files || {};
      const frontFile = (files.front && files.front[0]) || (files.recto && files.recto[0]);
      const backFile = (files.back && files.back[0]) || (files.verso && files.verso[0]);

      let front = frontFile ? bufferToDataUrl(frontFile) : (req.body?.front || req.body?.recto || null);
      let back = backFile ? bufferToDataUrl(backFile) : (req.body?.back || req.body?.verso || null);
      const force = String(req.body?.force || '').toLowerCase() === 'true' || req.body?.force === true;

      if (!front || !back) {
        return res.status(400).json({
          ok: false,
          error: 'Recto et verso obligatoires',
          error_code: 'INVALID_FILE',
        });
      }

      const raw = await callOcrJson({ front, back, force });
      return res.json(mapResponse(raw));
    } catch (err) {
      if (String(err.message) === 'UNSUPPORTED_FORMAT') {
        return res.status(400).json({ ok: false, error: 'Format non supporté', error_code: 'UNSUPPORTED_FORMAT' });
      }
      console.error('[workers/cin/analyze]', err);
      return res.status(500).json({ ok: false, error: 'OCR_FAILED', error_code: 'OCR_FAILED' });
    }
  },
);

module.exports = router;
