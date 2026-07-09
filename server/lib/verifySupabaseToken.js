/**
 * Valide un access_token Supabase via l'API Auth (évite les quirks client JS).
 */
const { resolveSupabaseUrl } = require('./supabaseAdmin');

async function verifySupabaseAccessToken(token) {
  const baseUrl = String(resolveSupabaseUrl() || '').replace(/\/+$/, '');
  const apikey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;

  if (!baseUrl || !apikey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY requis sur Railway.');
  }

  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`auth/v1/user HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

module.exports = { verifySupabaseAccessToken };
