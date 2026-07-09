/**
 * Validation JWT Supabase côté Vercel (fetch direct — fiable sur serverless).
 */

function env(name, fallback) {
  return String(process.env[name] || process.env[fallback] || '').trim();
}

function supabaseUrl() {
  return env('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
}

function collectApiKeys() {
  const keys = [];
  const anon = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (anon) keys.push({ label: 'anon', key: anon });
  if (service && service !== anon) keys.push({ label: 'service_role', key: service });
  return keys;
}

export async function verifySupabaseAccessTokenVercel(token) {
  const baseUrl = supabaseUrl();
  const keys = collectApiKeys();

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
      return body;
    }

    const reason = body?.msg || body?.message || body?.error_description || body?.error || text.slice(0, 200);
    errors.push(`${label}: HTTP ${res.status} — ${reason}`);
    console.error('[supabaseAuth:vercel] JWT rejeté', { label, status: res.status, reason });
  }

  throw Object.assign(
    new Error(`Session Supabase invalide ou expirée. (${errors.join(' | ')})`),
    { status: 401 },
  );
}
