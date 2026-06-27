/**
 * notificationRecipients.js — Résolution destinataires DG / Super Admin / RH
 */
import { getSupabase } from '../../lib/supabase';
import { DG_EMAIL } from '../auth/executiveCalendarAccess';
import { SUPER_ADMIN_EMAIL } from '../rh/isSuperAdmin';

const DG_EMAILS = new Set([DG_EMAIL.toLowerCase(), 'selim.moumni@gmail.com', SUPER_ADMIN_EMAIL.toLowerCase()]);

const SUPER_ADMIN_ROLES = new Set(['super_admin', 'super admin']);
const DG_ROLES = new Set(['dg', 'directeur_general', 'directeur general', 'directeur_général']);
const RH_ROLES = new Set(['rh', 'ressources_humaines', 'ressources humaines', 'rh_manager']);
const INVENTAIRE_ROLES = new Set([
  'magasinier', 'inventaire', 'logistique', 'depot', 'stock', 'gestionnaire_stock',
  'gestionnaire stock', 'responsable_depot', 'responsable depot',
]);

function normRole(role) {
  return String(role || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '_').trim();
}

function isSuperAdminProfile(p) {
  if (!p) return false;
  if (DG_EMAILS.has((p.email || '').toLowerCase())) return true;
  const r = normRole(p.role);
  return SUPER_ADMIN_ROLES.has(r.replace(/_/g, ' ')) || r === 'super_admin';
}

function isDGProfile(p) {
  if (!p) return false;
  if (DG_EMAILS.has((p.email || '').toLowerCase())) return true;
  const r = normRole(p.role);
  return DG_ROLES.has(r.replace(/_/g, ' ')) || DG_ROLES.has(r);
}

function isRhProfile(p) {
  if (!p) return false;
  const r = normRole(p.role);
  return RH_ROLES.has(r.replace(/_/g, ' ')) || RH_ROLES.has(r);
}

function isInventaireProfile(p) {
  if (!p) return false;
  const r = normRole(p.role);
  const spaced = r.replace(/_/g, ' ');
  if (INVENTAIRE_ROLES.has(spaced) || INVENTAIRE_ROLES.has(r)) return true;
  return r.includes('magasin') || r.includes('inventaire') || r.includes('depot') || r.includes('logistique');
}

let profilesCache = null;
let profilesCacheAt = 0;
const CACHE_MS = 60_000;

export async function fetchProfiles() {
  if (profilesCache && Date.now() - profilesCacheAt < CACHE_MS) return profilesCache;
  const { data, error } = await getSupabase().from('profiles').select('id, email, role, nom');
  if (error) {
    console.warn('[CITYMO] profiles for notifications', error);
    return profilesCache || [];
  }
  profilesCache = data || [];
  profilesCacheAt = Date.now();
  return profilesCache;
}

export async function listSuperAdminAndDGRecipients() {
  const profiles = await fetchProfiles();
  const map = new Map();
  profiles.forEach((p) => {
    if (isSuperAdminProfile(p) || isDGProfile(p)) map.set(p.id, p);
  });
  return [...map.values()];
}

export async function listRhRecipients() {
  const profiles = await fetchProfiles();
  return profiles.filter((p) => isRhProfile(p));
}

export async function listInventaireRecipients() {
  const profiles = await fetchProfiles();
  return profiles.filter((p) => isInventaireProfile(p));
}

export async function findProfileById(userId) {
  if (!userId) return null;
  const profiles = await fetchProfiles();
  return profiles.find((p) => p.id === userId) || null;
}

export async function findProfileByEmail(email) {
  if (!email) return null;
  const q = email.toLowerCase();
  const profiles = await fetchProfiles();
  return profiles.find((p) => (p.email || '').toLowerCase() === q) || null;
}

export function invalidateProfilesCache() {
  profilesCache = null;
  profilesCacheAt = 0;
}

/** Trouve un profil utilisateur par nom affiché (assigné tâche DG). */
export async function findProfileByAssigneeName(assigneeName) {
  if (!assigneeName?.trim()) return null;
  const q = String(assigneeName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const profiles = await fetchProfiles();
  return profiles.find((p) => {
    const nom = String(p.nom || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    return nom === q;
  }) || null;
}
