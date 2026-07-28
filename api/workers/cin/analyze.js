/**
 * Vercel — POST /api/workers/cin/analyze
 * Auth Supabase + Google Cloud Vision (même contrat frontend).
 *
 * Important : @google-cloud/vision doit être dans le package.json RACINE
 * (install Vercel), sinon la function crash avec "A server error has occurred".
 */
import { createRequire } from 'module';
import { verifySupabaseAccessTokenVercel } from '../../../lib/verifySupabaseTokenVercel.mjs';

const require = createRequire(import.meta.url);

let analyzeCnieGoogle = null;
let googleVision = null;
let loadError = null;
try {
  ({ analyzeCnieGoogle } = require('../../../server/services/cnieGoogleAnalyze'));
  googleVision = require('../../../server/services/googleVision');
} catch (err) {
  loadError = err;
  console.error('[cin/analyze] module load failed', {
    code: err?.code || 'LOAD_FAILED',
    message: String(err?.message || 'error').slice(0, 160),
  });
}

export const config = {
  api: { bodyParser: { sizeLimit: '4.5mb' } },
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
      error: typeof data?.error === 'string' ? data.error : 'Service OCR indisponible',
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

function fail(res, status, error, error_code, extra = {}) {
  return res.status(status).json({
    ok: false,
    success: false,
    error,
    error_code,
    allow_force: true,
    mode: 'suggestion',
    requires_manual_review: true,
    ...extra,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed', error_code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    if (loadError || !analyzeCnieGoogle || !googleVision) {
      return fail(
        res,
        503,
        'OCR non disponible sur le serveur — saisie manuelle disponible',
        loadError?.code === 'MODULE_NOT_FOUND' ? 'OCR_DEPENDENCY_MISSING' : 'OCR_LOAD_FAILED',
      );
    }

    const token = extractToken(req);
    const clientApiKey = req.headers.apikey || '';
    if (!token) {
      return fail(res, 401, 'Authentification requise', 'UNAUTHORIZED');
    }
    await verifySupabaseAccessTokenVercel(token, clientApiKey);

    if (OCR_ENGINE === 'disabled') {
      return fail(res, 503, 'Scan CNIE désactivé — saisie manuelle disponible', 'OCR_DISABLED');
    }

    if (!googleVision.visionAvailable()) {
      return fail(res, 503, 'OCR non configuré — saisie manuelle disponible', 'OCR_NOT_CONFIGURED');
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const front = body.front || body.recto || null;
    const back = body.back || body.verso || null;
    if (!front && !back) {
      return fail(res, 400, 'Importez au moins une face (recto et/ou verso)', 'INVALID_FILE');
    }

    const raw = await analyzeCnieGoogle({ front, back, force: !!body.force });
    return res.status(200).json(mapResponse(raw));
  } catch (err) {
    const status = err.status || (err.code === 'UNAUTHORIZED' ? 401 : 200);
    const msg = status === 401
      ? (err.message || 'Authentification requise')
      : 'Analyse impossible — saisie manuelle disponible';
    console.error('[cin/analyze] handler error', {
      status,
      code: err?.code || 'OCR_FAILED',
      message: String(err?.message || 'error').slice(0, 160),
    });
    return fail(res, status === 401 ? 401 : 200, msg, status === 401 ? 'UNAUTHORIZED' : (err.code || 'OCR_FAILED'));
  }
}
