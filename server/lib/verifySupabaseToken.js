/**
 * Validation JWT Supabase (Railway) — auth.getUser(token) + logs diagnostic backup.
 */
const { createClient } = require('@supabase/supabase-js');
const { CITYMO_SUPABASE_URL } = require('../config/supabaseProject');
const {
  resolveSupabaseProjectUrl,
  collectSupabaseApiKeys,
  supabaseUrlHost,
} = require('./supabaseEnv');

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

function logJwtDiagnostics(token, reqMeta = {}) {
  const claims = decodeJwtPayload(token);
  const backendUrl = resolveSupabaseProjectUrl();
  const issHost = claims?.iss ? (() => { try { return new URL(claims.iss).host; } catch { return claims.iss; } })() : null;
  const backendHost = supabaseUrlHost(backendUrl);
  const issMatches = issHost && backendHost ? issHost === backendHost : null;

  console.info('[backup:auth:railway] validate', {
    authorizationPresent: Boolean(token),
    tokenLength: token?.length || 0,
    supabaseUrl: backendUrl,
    supabaseUrlHost: backendHost,
    jwtIssHost: issHost,
    jwtSub: claims?.sub || null,
    jwtExp: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
    jwtExpired: claims?.exp ? claims.exp * 1000 < Date.now() : null,
    expectedCitymoHost: supabaseUrlHost(CITYMO_SUPABASE_URL),
    issMatchesBackend: issMatches,
    ...reqMeta,
  });

  return { claims, issMatches, backendHost, issHost };
}

async function verifyWithGetUser(baseUrl, token, apikey, keyLabel) {
  const client = createClient(baseUrl, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  return {
    ok: Boolean(user?.id),
    user,
    error,
    keyLabel,
    errorMessage: error?.message || null,
    errorStatus: error?.status || null,
  };
}

async function verifySupabaseAccessToken(token, reqMeta = {}) {
  const baseUrl = resolveSupabaseProjectUrl();
  const keys = collectSupabaseApiKeys(reqMeta.clientApiKey);
  const diag = logJwtDiagnostics(token, reqMeta);

  if (!baseUrl) {
    throw new Error('SUPABASE_URL manquant sur Railway.');
  }
  if (!keys.length) {
    throw new Error('SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY requis sur Railway.');
  }

  const errors = [];

  for (const { label, key } of keys) {
    const result = await verifyWithGetUser(baseUrl, token, key, label);
    if (result.ok && result.user?.id) {
      console.info('[backup:auth:railway] getUser OK', {
        keyUsed: label,
        userId: result.user.id,
        email: result.user.email || null,
      });
      return result.user;
    }

    const reason = result.errorMessage
      || result.error?.code
      || `getUser sans utilisateur (${label})`;

    errors.push(`${label}: ${reason}`);
    console.error('[backup:auth:railway] getUser rejeté', {
      keyUsed: label,
      reason,
      errorStatus: result.errorStatus,
      jwtIssHost: diag.issHost,
      backendUrlHost: diag.backendHost,
      issMatchesBackend: diag.issMatches,
    });
  }

  throw new Error(errors.join(' | '));
}

module.exports = {
  verifySupabaseAccessToken,
  decodeJwtPayload,
  logJwtDiagnostics,
};
