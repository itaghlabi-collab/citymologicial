/**
 * Vercel — proxy /api/backups* → Railway
 * Valide le JWT Supabase côté Vercel (mêmes clés que le frontend), puis signe la requête pour Railway.
 */
import crypto from 'crypto';
import { requireSupabaseSuperAdmin } from '../lib/supabaseAdminVercel.mjs';

export const config = { maxDuration: 300 };

function railwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || 'https://citymologicial-production.up.railway.app';
  return String(raw).trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

function resolveBackupPath(req) {
  const p = req.query.path;
  if (p == null || p === '') return 'backups';
  const parts = Array.isArray(p) ? p : String(p).split('/').filter(Boolean);
  return parts.length ? `backups/${parts.join('/')}` : 'backups';
}

function proxySignature(userId) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || !userId) return null;
  return crypto.createHmac('sha256', key).update(String(userId)).digest('hex');
}

export default async function handler(req, res) {
  let verified;
  try {
    verified = await requireSupabaseSuperAdmin(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const base = railwayBase();
  if (!base) {
    return res.status(503).json({
      error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
    });
  }

  const rel = resolveBackupPath(req);
  const url = `${base}/api/${rel}`;
  const sig = proxySignature(verified.user.id);
  if (!sig) {
    return res.status(503).json({
      error: 'Proxy sauvegarde non configuré. SUPABASE_SERVICE_ROLE_KEY requis sur Vercel.',
    });
  }

  const headers = {
    'X-Citymo-Verified-User-Id': verified.user.id,
    'X-Citymo-Proxy-Sig': sig,
  };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers['x-supabase-token']) headers['X-Supabase-Token'] = req.headers['x-supabase-token'];
  if (req.headers.apikey) headers.apikey = req.headers.apikey;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  const method = req.method || 'GET';
  const init = { method, headers };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && req.body != null) {
    init.body = typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body);
  }

  const upstream = await fetch(url, init);
  const contentType = upstream.headers.get('content-type') || 'application/json';
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  if (!text) return res.end();
  return res.send(text);
}
