/**
 * Validation JWT Supabase côté Vercel (fetch direct — aligné sur le frontend).
 */
import { CITYMO_SUPABASE_URL } from './supabaseProject.mjs';

function env(name, fallback) {
  return String(process.env[name] || process.env[fallback] || '').trim();
}

function supabaseUrl() {
  return (env('SUPABASE_URL', 'VITE_SUPABASE_URL') || CITYMO_SUPABASE_URL).replace(/\/+$/, '');
}

function collectApiKeys(clientApiKey) {
  const seen = new Set();
  const keys = [];

  const push = (label, key) => {
    const trimmed = String(key || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push({ label, key: trimmed });
  };

  push('client_apikey', clientApiKey);
  push('SUPABASE_ANON_KEY', env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'));
  push('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY);
  push('SUPABASE_SERVICE_ROLE_KEY', env('SUPABASE_SERVICE_ROLE_KEY'));

  return keys;
}

export async function verifySupabaseAccessTokenVercel(token, clientApiKey) {
  const baseUrl = supabaseUrl();
  const keys = collectApiKeys(clientApiKey);

  if (!baseUrl) {
    throw Object.assign(new Error('VITE_SUPABASE_URL manquant sur Vercel.'), { status: 503 });
  }
  if (!keys.length) {
    throw Object.assign(
      new Error('VITE_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY requis sur Vercel.'),
      { status: 503 },
    );
  }

  const errors = [];

  for (const { label, key } of keys) {
    const res = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: key,
      },
    });

    const text = await res.text().catch(() => '');
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (res.ok && body?.id) {
      console.info('[supabaseAuth:vercel] JWT OK', { keyUsed: label, userId: body.id });
      return body;
    }

    const reason = body?.msg || body?.message || body?.error_description || body?.error || text.slice(0, 200);
    errors.push(`${label}: HTTP ${res.status} — ${reason}`);
    console.error('[supabaseAuth:vercel] JWT rejeté', { label, status: res.status, reason, baseHost: new URL(baseUrl).host });
  }

  throw Object.assign(
    new Error(`Session Supabase invalide ou expirée. (${errors.join(' | ')})`),
    { status: 401 },
  );
}
