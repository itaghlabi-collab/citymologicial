/**
 * Client Supabase admin (service_role) — jamais exposé au frontend.
 */
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { CITYMO_SUPABASE_URL } = require('../config/supabaseProject');

let adminClient = null;

function resolveSupabaseUrl() {
  return process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || CITYMO_SUPABASE_URL;
}

/** Diagnostic démarrage — projet Supabase attendu vs variables Railway. */
function logSupabaseProjectConfigOnStartup() {
  const url = resolveSupabaseUrl();
  let host = '(manquante)';
  try {
    host = new URL(url).host;
  } catch {
    host = '(url invalide)';
  }
  const expectedHost = new URL(CITYMO_SUPABASE_URL).host;
  console.info('[supabaseAuth:debug] config Railway', {
    backendUrlHost: host,
    expectedCitymoHost: expectedHost,
    urlMatchesCitymo: host === expectedHost,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasViteSupabaseAnonKey: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    frontendExpected: 'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (Vercel)',
  });
}

function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    throw new Error(`Variables Railway manquantes : ${missing.join(', ')}`);
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  return adminClient;
}

function getSupabaseAnon() {
  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_ANON_KEY');
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
