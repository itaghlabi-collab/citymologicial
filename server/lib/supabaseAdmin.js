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

module.exports = { getSupabaseAdmin, getSupabaseAnon, resolveSupabaseUrl };
