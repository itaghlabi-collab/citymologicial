/**
 * POST /api/workers/cin/analyze
 * Scan CNIE ouvriers via Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 * Même contrat JSON pour le frontend. Aucune clé Google exposée au navigateur.
 */
'use strict';

const express = require('express');
const multer = require('multer');
const { verifySupabaseAccessToken } = require('../lib/verifySupabaseToken');
const { analyzeCnieGoogle } = require('../services/cnieGoogleAnalyze');
const googleVision = require('../services/googleVision');

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

const OCR_ENGINE = (process.env.OCR_ENGINE || 'google_vision').trim().toLowerCase();

/**
 * Auth JWT locale à la route OCR uniquement (n’altère pas supabaseAuth.js global).
 * Vérifie le Bearer token via anon/publishable key — sans service_role.
 */
async function requireOcrUser(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization || '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice(7).trim()
      : (typeof req.headers['x-supabase-token'] === 'string' ? req.headers['x-supabase-token'].trim() : '');
    const clientApiKey = req.headers.apikey || req.headers.Apikey || '';

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Authentification Supabase requise.',
        error_code: 'UNAUTHORIZED',
      });
    }

    let user;
    try {
      user = await verifySupabaseAccessToken(token, { clientApiKey });
    } catch (_) {
      return res.status(401).json({
        ok: false,
        error: 'Session Supabase invalide ou expirée.',
        error_code: 'UNAUTHORIZED',
      });
    }

    if (!user?.id) {
      return res.status(401).json({
        ok: false,
        error: 'Session Supabase invalide ou expirée.',
        error_code: 'UNAUTHORIZED',
      });
    }

    req.user = {
      id: user.id,
      email: (user.email || '').toLowerCase(),
      role: 'user',
      nom: user.email || '',
    };
    return next();
  } catch (err) {
    console.error('[workers/cin/analyze] auth', String(err.message || '').slice(0, 120));
    return res.status(200).json({
      ok: false,
      success: false,
      error: 'Authentification indisponible — saisie manuelle disponible',
      error_code: 'OCR_FAILED',
      allow_force: true,
      mode: 'suggestion',
      requires_manual_review: true,
    });
  }
}

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
      provider: data?.engine_used || 'google_vision',
      engine_used: data?.engine_used || 'google_vision',
      mode: 'suggestion',
      requires_manual_review: true,
    };
  }

  const fields = data.fields || {};
  const wf = data.worker_form || {};
  const nat = fields.nationalite;
  if (nat && (nat.valid === false || !nat.value || String(nat.value).trim().length <= 2)) {
    fields.nationalite = { value: null, confidence: 0, valid: false, source: null };
    wf.nationalite = null;
  }

  Object.keys(fields).forEach((k) => {
    const f = fields[k];
    if (!f || typeof f !== 'object') return;
    if (!f.confidence_level && typeof f.confidence === 'number') {
      const c = f.confidence;
      f.confidence_level = c >= 0.85 ? 'haute' : c >= 0.70 ? 'moyenne' : 'faible';
    }
  });

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
    lieu_naissance: wf.ville_naissance || null,
    nationalite: wf.nationalite || null,
    sexe: wf.sexe || null,
    date_expiration: wf.date_expiration || null,
    autorite: wf.autorite || null,
    adresse: wf.adresse || null,
    nom_arabe: wf.nom_arabe || null,
    prenom_arabe: wf.prenom_arabe || null,
    confidence_globale: data.confidence_globale === 'elevee' ? 'haute' : (data.confidence_globale || 'moyenne'),
    progress: data.progress || [],
    warnings: data.warnings || [],
    faces: data.faces || {},
    faces_swapped: !!data.faces_swapped,
    engine_used: data.engine_used || 'google_vision',
    engine_version: data.engine_version,
    duration_ms: data.duration_ms,
    partial: !!data.partial,
    provider: 'google_vision',
    mode: 'suggestion',
    requires_manual_review: true,
  };
}

function bufferToDataUrl(file) {
  if (!file?.buffer) return null;
  const mime = file.mimetype || 'image/jpeg';
  return `data:${mime};base64,${file.buffer.toString('base64')}`;
}

router.post(
  '/cin/analyze',
  requireOcrUser,
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'recto', maxCount: 1 },
    { name: 'verso', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (OCR_ENGINE === 'disabled') {
        return res.status(503).json({
          ok: false,
          success: false,
          error: 'Scan CNIE désactivé — saisie manuelle disponible',
          error_code: 'OCR_DISABLED',
          allow_force: false,
          mode: 'suggestion',
          requires_manual_review: true,
        });
      }

      if (!googleVision.visionAvailable()) {
        console.warn('[workers/cin/analyze] Google Vision non configuré');
        return res.status(503).json({
          ok: false,
          success: false,
          error: 'OCR non configuré — saisie manuelle disponible',
          error_code: 'OCR_NOT_CONFIGURED',
          allow_force: true,
          mode: 'suggestion',
          requires_manual_review: true,
          warnings: ['Le formulaire ouvrier reste utilisable sans scan'],
        });
      }

      const files = req.files || {};
      const frontFile = (files.front && files.front[0]) || (files.recto && files.recto[0]);
      const backFile = (files.back && files.back[0]) || (files.verso && files.verso[0]);

      const front = frontFile ? bufferToDataUrl(frontFile) : (req.body?.front || req.body?.recto || null);
      const back = backFile ? bufferToDataUrl(backFile) : (req.body?.back || req.body?.verso || null);
      const force = String(req.body?.force || '').toLowerCase() === 'true' || req.body?.force === true;

      if (!front && !back) {
        return res.status(400).json({
          ok: false,
          error: 'Importez au moins une face (recto et/ou verso)',
          error_code: 'INVALID_FILE',
          mode: 'suggestion',
          requires_manual_review: true,
          allow_force: false,
        });
      }

      console.info('[workers/cin/analyze] start', {
        engine: 'google_vision',
        hasFront: Boolean(front),
        hasBack: Boolean(back),
        frontBytes: front ? (frontFile?.size || String(front).length) : 0,
        backBytes: back ? (backFile?.size || String(back).length) : 0,
        force: !!force,
      });

      const raw = await analyzeCnieGoogle({ front, back, force });
      const mapped = mapResponse(raw);
      const status = raw.ok === false && raw.error_code === 'OCR_NOT_CONFIGURED' ? 503 : 200;
      return res.status(status).json(mapped);
    } catch (err) {
      if (String(err.message) === 'UNSUPPORTED_FORMAT') {
        return res.status(400).json({ ok: false, error: 'Format non supporté', error_code: 'UNSUPPORTED_FORMAT' });
      }
      console.error('[workers/cin/analyze] unexpected', {
        error_code: err.code || 'OCR_FAILED',
        message: String(err.message || '').slice(0, 120),
      });
      return res.status(200).json({
        ok: false,
        success: false,
        error: 'Analyse impossible — saisie manuelle disponible',
        error_code: 'OCR_FAILED',
        allow_force: true,
        mode: 'suggestion',
        requires_manual_review: true,
        warnings: ['Les images restent sélectionnées ; vous pouvez remplir le formulaire manuellement'],
      });
    }
  },
);

module.exports = router;
