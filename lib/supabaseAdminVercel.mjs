/**
 * Client Supabase côté Vercel serverless (service_role jamais exposé au navigateur).
 */
import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAILS = [
  'selim.moumni@citymo.ma',
  'selim.moumni@gmail.com',
];

function env(name, fallback) {
  const v = process.env[name] || process.env[fallback] || '';
  return String(v).trim();
}

export function getSupabaseAdmin() {
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis sur Vercel.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAnon() {
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY requis sur Vercel.');
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

  const anon = getSupabaseAnon();
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) {
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
