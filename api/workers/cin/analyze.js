/**
 * Vercel — POST /api/workers/cin/analyze
 * Auth Supabase + Google Cloud Vision (même contrat frontend).
 */
import { createRequire } from 'module';
import { verifySupabaseAccessTokenVercel } from '../../../lib/verifySupabaseTokenVercel.mjs';

const require = createRequire(import.meta.url);
const { analyzeCnieGoogle } = require('../../../server/services/cnieGoogleAnalyze');
const googleVision = require('../../../server/services/googleVision');

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
  maxDuration: 60,
};

const OCR_ENGINE = (process.env.OCR_ENGINE || 'google_vision').trim().toLowerCase();

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const alt = req.headers['x-supabase-token'];
  return typeof alt === 'string' ? alt.trim() : '';
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
      provider: 'google_vision',
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
    duration_ms: data.duration_ms,
    partial: !!data.partial,
    provider: 'google_vision',
    mode: 'suggestion',
    requires_manual_review: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = extractToken(req);
    const clientApiKey = req.headers.apikey || '';
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Authentification requise', error_code: 'UNAUTHORIZED' });
    }
    await verifySupabaseAccessTokenVercel(token, clientApiKey);

    if (OCR_ENGINE === 'disabled') {
      return res.status(503).json({
        ok: false,
        error: 'Scan CNIE désactivé — saisie manuelle disponible',
        error_code: 'OCR_DISABLED',
        mode: 'suggestion',
        requires_manual_review: true,
      });
    }

    if (!googleVision.visionAvailable()) {
      return res.status(503).json({
        ok: false,
        error: 'OCR non configuré — saisie manuelle disponible',
        error_code: 'OCR_NOT_CONFIGURED',
        mode: 'suggestion',
        requires_manual_review: true,
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const front = body.front || body.recto || null;
    const back = body.back || body.verso || null;
    if (!front && !back) {
      return res.status(400).json({
        ok: false,
        error: 'Importez au moins une face (recto et/ou verso)',
        error_code: 'INVALID_FILE',
        mode: 'suggestion',
        requires_manual_review: true,
      });
    }

    const raw = await analyzeCnieGoogle({ front, back, force: !!body.force });
    return res.status(200).json(mapResponse(raw));
  } catch (err) {
    const status = err.status || 200;
    return res.status(status === 401 ? 401 : 200).json({
      ok: false,
      success: false,
      error: status === 401 ? (err.message || 'UNAUTHORIZED') : 'Analyse impossible — saisie manuelle disponible',
      error_code: status === 401 ? 'UNAUTHORIZED' : 'OCR_FAILED',
      allow_force: true,
      mode: 'suggestion',
      requires_manual_review: true,
    });
  }
}
