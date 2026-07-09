/**
 * Validation JWT Supabase + logs temporaires de diagnostic (Railway).
 */
const { resolveSupabaseUrl } = require('./supabaseAdmin');
const { CITYMO_SUPABASE_URL } = require('../config/supabaseProject');

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function maskHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ? '(url invalide)' : '(manquante)';
  }
}

function keySourceLabel() {
  return {
    url: process.env.SUPABASE_URL
      ? 'SUPABASE_URL'
      : process.env.VITE_SUPABASE_URL
        ? 'VITE_SUPABASE_URL'
        : 'CITYMO_DEFAULT',
    anon: process.env.SUPABASE_ANON_KEY
      ? 'SUPABASE_ANON_KEY'
      : process.env.VITE_SUPABASE_ANON_KEY
        ? 'VITE_SUPABASE_ANON_KEY'
        : null,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
  };
}

function logJwtDiagnostics(token, reqMeta = {}) {
  const claims = decodeJwtPayload(token);
  const backendUrl = resolveSupabaseUrl();
  const sources = keySourceLabel();
  const issHost = claims?.iss ? maskHost(claims.iss) : null;
  const backendHost = maskHost(backendUrl);
  const issMatches = issHost && backendHost
    ? String(claims.iss).startsWith(String(backendUrl).replace(/\/+$/, ''))
      || issHost === backendHost
    : null;

  console.info('[supabaseAuth:debug] requête backup', {
    ...reqMeta,
    tokenLength: token?.length || 0,
    jwtIssHost: issHost,
    jwtSub: claims?.sub || null,
    jwtExp: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
    jwtExpired: claims?.exp ? claims.exp * 1000 < Date.now() : null,
    backendUrlHost: backendHost,
    expectedCitymoHost: maskHost(CITYMO_SUPABASE_URL),
    issMatchesBackend: issMatches,
    envSources: sources,
  });

  return { claims, issMatches, backendHost, issHost };
}

async function callAuthUser(baseUrl, token, apikey, keyLabel) {
  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey,
    },
  });

  const bodyText = await res.text().catch(() => '');
  let bodyJson = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    bodyJson = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    keyLabel,
    bodyText: bodyText.slice(0, 300),
    bodyJson,
  };
}

async function verifySupabaseAccessToken(token, reqMeta = {}) {
  const baseUrl = String(resolveSupabaseUrl() || '').replace(/\/+$/, '');
  const seen = new Set();
  const attempts = [];

  const pushKey = (label, key) => {
    const trimmed = String(key || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    attempts.push([label, trimmed]);
  };

  pushKey('client_apikey', reqMeta.clientApiKey);
  pushKey('SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY);
  pushKey('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY);
  pushKey('service_role', process.env.SUPABASE_SERVICE_ROLE_KEY);
  const diag = logJwtDiagnostics(token, reqMeta);

  if (!baseUrl) {
    throw new Error('SUPABASE_URL manquant sur Railway.');
  }
    throw new Error('SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY requis sur Railway.');
  }

  const errors = [];

  for (const [label, apikey] of attempts) {
    const result = await callAuthUser(baseUrl, token, apikey, label);
    if (result.ok && result.bodyJson?.id) {
      console.info('[supabaseAuth:debug] JWT OK', {
        keyUsed: label,
        userId: result.bodyJson.id,
        email: result.bodyJson.email || null,
      });
      return result.bodyJson;
    }

    const reason = result.bodyJson?.msg
      || result.bodyJson?.message
      || result.bodyJson?.error_description
      || result.bodyJson?.error
      || result.bodyText
      || `HTTP ${result.status}`;

    console.error('[supabaseAuth:debug] JWT rejeté', {
      keyUsed: label,
      httpStatus: result.status,
      reason,
      jwtIssHost: diag.issHost,
      backendUrlHost: diag.backendHost,
      issMatchesBackend: diag.issMatches,
    });

    errors.push(`${label}: HTTP ${result.status} — ${reason}`);
  }

  throw new Error(errors.join(' | '));
}

module.exports = {
  verifySupabaseAccessToken,
  decodeJwtPayload,
  logJwtDiagnostics,
};
