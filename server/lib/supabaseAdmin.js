/**
 * Client Supabase admin (service_role) — jamais exposé au frontend.
 */
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { CITYMO_SUPABASE_URL } = require('../config/supabaseProject');
const {
  resolveSupabaseProjectUrl,
  resolveSupabaseServiceRoleKey,
  resolveSupabaseAnonKey,
  supabaseUrlHost,
} = require('./supabaseEnv');

let adminClient = null;

function resolveSupabaseUrl() {
  return resolveSupabaseProjectUrl();
}

/** Diagnostic démarrage — projet Supabase attendu vs variables Railway. */
function logSupabaseProjectConfigOnStartup() {
  const url = resolveSupabaseUrl();
  console.info('[backup:auth:railway] config startup', {
    backendUrl: url,
    backendUrlHost: supabaseUrlHost(url),
    expectedCitymoHost: supabaseUrlHost(CITYMO_SUPABASE_URL),
    urlMatchesCitymo: supabaseUrlHost(url) === supabaseUrlHost(CITYMO_SUPABASE_URL),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasViteSupabaseAnonKey: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
    hasPublishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    frontendExpected: 'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (Vercel)',
  });
}

function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = resolveSupabaseProjectUrl();
  const key = resolveSupabaseServiceRoleKey();

  if (!url || !key) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY');
    throw new Error(`Variables Railway manquantes : ${missing.join(', ')}`);
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  return adminClient;
}

function getSupabaseAnon() {
  const url = resolveSupabaseProjectUrl();
  const key = resolveSupabaseAnonKey();
  if (!url || !key) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY');
    throw new Error(`Variables Railway manquantes : ${missing.join(', ')}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
}

module.exports = {
  getSupabaseAdmin,
  getSupabaseAnon,
  resolveSupabaseUrl,
  logSupabaseProjectConfigOnStartup,
};
