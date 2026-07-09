/**
 * Validation JWT Supabase côté Vercel — auth.getUser(token) + logs diagnostic backup.
 */
import { createClient } from '@supabase/supabase-js';
import {
  resolveSupabaseProjectUrl,
  collectSupabaseApiKeys,
  supabaseUrlHost,
} from './supabaseEnv.mjs';

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

export async function verifySupabaseAccessTokenVercel(token, clientApiKey, reqMeta = {}) {
  const baseUrl = resolveSupabaseProjectUrl();
  const keys = collectSupabaseApiKeys(clientApiKey);

  console.info('[backup:auth:vercel] validate', {
    authorizationPresent: Boolean(token),
    tokenLength: token?.length || 0,
    supabaseUrl: baseUrl,
    supabaseUrlHost: supabaseUrlHost(baseUrl),
    apiKeysToTry: keys.map((k) => ({ label: k.label, kind: k.kind, length: k.length })),
    ...reqMeta,
  });

  if (!baseUrl) {
    throw Object.assign(new Error('VITE_SUPABASE_URL manquant sur Vercel.'), { status: 503 });
  }
  if (!keys.length) {
    throw Object.assign(
      new Error('VITE_SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY requis sur Vercel.'),
      { status: 503 },
    );
  }

  const errors = [];

  for (const { label, key } of keys) {
    const result = await verifyWithGetUser(baseUrl, token, key, label);

    if (result.ok && result.user?.id) {
      console.info('[backup:auth:vercel] getUser OK', {
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
    console.error('[backup:auth:vercel] getUser rejeté', {
      keyUsed: label,
      reason,
      errorStatus: result.errorStatus,
      supabaseUrlHost: supabaseUrlHost(baseUrl),
    });
  }

  throw Object.assign(
    new Error(`Session Supabase invalide ou expirée. (${errors.join(' | ')})`),
    { status: 401 },
  );
}
