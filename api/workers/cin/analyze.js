/**
 * Vercel — POST /api/workers/cin/analyze
 * Auth Supabase + proxy vers OCR_SERVICE_URL (jamais exposé au client).
 */
import { verifySupabaseAccessTokenVercel } from '../../../lib/verifySupabaseTokenVercel.mjs';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
  maxDuration: 60,
};

const OCR_SERVICE_URL = (process.env.OCR_SERVICE_URL || '').replace(/\/$/, '');
const OCR_SERVICE_API_KEY = process.env.OCR_SERVICE_API_KEY || '';
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 90000);

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const alt = req.headers['x-supabase-token'];
  return typeof alt === 'string' ? alt.trim() : '';
}

async function callOcr(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (OCR_SERVICE_API_KEY) headers['X-API-Key'] = OCR_SERVICE_API_KEY;
    const res = await fetch(`${OCR_SERVICE_URL}/v1/cin/analyze-json`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: 'Service OCR indisponible', error_code: 'OCR_UNAVAILABLE' };
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: "Temps d'analyse dépassé", error_code: 'OCR_TIMEOUT', allow_force: true };
    }
    return { ok: false, error: 'Service OCR indisponible', error_code: 'OCR_UNAVAILABLE', allow_force: true };
  } finally {
    clearTimeout(timer);
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
      provider: 'citymo',
    };
  }
  const fields = data.fields || {};
  const wf = data.worker_form || {};
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
    engine_used: data.engine_used,
    partial: !!data.partial,
    provider: 'citymo',
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

    if (!OCR_SERVICE_URL) {
      return res.status(503).json({ ok: false, error: 'OCR non configuré', error_code: 'OCR_NOT_CONFIGURED' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const front = body.front || body.recto;
    const back = body.back || body.verso;
    if (!front || !back) {
      return res.status(400).json({ ok: false, error: 'Recto et verso obligatoires', error_code: 'INVALID_FILE' });
    }

    const raw = await callOcr({ front, back, force: !!body.force });
    return res.status(200).json(mapResponse(raw));
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || 'OCR_FAILED',
      error_code: status === 401 ? 'UNAUTHORIZED' : 'OCR_FAILED',
    });
  }
}
