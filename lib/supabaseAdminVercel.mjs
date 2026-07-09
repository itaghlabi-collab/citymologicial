/**
 * Client Supabase côté Vercel serverless (service_role jamais exposé au navigateur).
 */
import { createClient } from '@supabase/supabase-js';
import { verifySupabaseAccessTokenVercel } from './verifySupabaseTokenVercel.mjs';
import {
  resolveSupabaseProjectUrl,
  resolveSupabaseServiceRoleKey,
  resolveSupabaseAnonKey,
  supabaseUrlHost,
} from './supabaseEnv.mjs';

const SUPER_ADMIN_EMAILS = [
  'selim.moumni@citymo.ma',
  'selim.moumni@gmail.com',
];

export function getSupabaseAdmin() {
  const url = resolveSupabaseProjectUrl();
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) requis sur Vercel.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAnon() {
  const url = resolveSupabaseProjectUrl();
  const key = resolveSupabaseAnonKey();
  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY requis sur Vercel.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Vérifie JWT Supabase + Super Admin. Retourne { user, profile, email } ou lève. */
export async function requireSupabaseSuperAdmin(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  let token = '';
  if (header.startsWith('Bearer ')) token = header.slice(7).trim();
  else if (typeof req.headers['x-supabase-token'] === 'string') {
    token = req.headers['x-supabase-token'].trim();
  }

  if (!token) {
    const err = new Error('Authentification Supabase requise.');
    err.status = 401;
    throw err;
  }

  const clientApiKey = req.headers.apikey || req.headers.Apikey || '';

  console.info('[backup:auth:vercel] incoming', {
    method: req.method,
    authorizationPresent: Boolean(token),
    authorizationBearer: header.startsWith('Bearer '),
    tokenLength: token.length,
    apikeyPresent: Boolean(clientApiKey),
    supabaseUrlHost: supabaseUrlHost(),
  });

  let user;
  try {
    user = await verifySupabaseAccessTokenVercel(token, clientApiKey, {
      authorizationPresent: Boolean(token),
      tokenLength: token.length,
    });
  } catch (err) {
    console.error('[backup:auth:vercel] échec validation', {
      status: err.status || 401,
      message: err.message,
      supabaseUrlHost: supabaseUrlHost(),
    });
    throw Object.assign(
      new Error(err.message || 'Session Supabase invalide ou expirée.'),
      { status: err.status || 401 },
    );
  }

  if (!user?.id) {
    const err = new Error('Session Supabase invalide ou expirée.');
    err.status = 401;
    throw err;
  }

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, role, statut, nom, erp_roles ( code, est_admin )')
    .eq('id', user.id)
    .maybeSingle();

  const email = (user.email || profile?.email || '').toLowerCase();
  const role = (profile?.role || '').toLowerCase().replace(/\s+/g, '_');
  const roleCode = (profile?.erp_roles?.code || '').toLowerCase();
  const isSuper = SUPER_ADMIN_EMAILS.includes(email)
    || role === 'super_admin'
    || roleCode === 'super_admin'
    || profile?.erp_roles?.est_admin === true;

  if (!isSuper) {
    const err = new Error('Accès réservé aux Super Admin.');
    err.status = 403;
    throw err;
  }

  if (profile?.statut && profile.statut !== 'actif') {
    const err = new Error('Compte désactivé.');
    err.status = 403;
    throw err;
  }

  return { user, profile, email };
}
