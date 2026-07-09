/**
 * Supabase env — URL projet (sans /rest/v1) + clés anon JWT / sb_publishable / sb_secret.
 */
import { CITYMO_SUPABASE_URL } from './supabaseProject.mjs';

/** Base URL projet : https://<ref>.supabase.co (jamais /rest/v1 ni /auth/v1). */
export function normalizeSupabaseProjectUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  return url
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/auth\/v1$/i, '');
}

export function resolveSupabaseProjectUrl() {
  const raw = process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || CITYMO_SUPABASE_URL;
  return normalizeSupabaseProjectUrl(raw) || CITYMO_SUPABASE_URL;
}

export function describeApiKey(key) {
  const k = String(key || '').trim();
  if (!k) return { present: false, kind: null, length: 0 };
  if (k.startsWith('sb_publishable_')) return { present: true, kind: 'sb_publishable', length: k.length };
  if (k.startsWith('sb_secret_')) return { present: true, kind: 'sb_secret', length: k.length };
  if (k.startsWith('eyJ')) return { present: true, kind: 'jwt', length: k.length };
  return { present: true, kind: 'unknown', length: k.length };
}

export function collectSupabaseApiKeys(clientApiKey) {
  const seen = new Set();
  const keys = [];

  const push = (label, key) => {
    const trimmed = String(key || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push({ label, key: trimmed, ...describeApiKey(trimmed) });
  };

  push('client_apikey', clientApiKey);
  push('SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY);
  push('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY);
  push('SUPABASE_PUBLISHABLE_KEY', process.env.SUPABASE_PUBLISHABLE_KEY);
  push('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  push('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  push('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY);

  return keys;
}

export function resolveSupabaseServiceRoleKey() {
  return String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || '',
  ).trim();
}

export function resolveSupabaseAnonKey() {
  return String(
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || '',
  ).trim();
}

export function supabaseUrlHost(url = resolveSupabaseProjectUrl()) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
