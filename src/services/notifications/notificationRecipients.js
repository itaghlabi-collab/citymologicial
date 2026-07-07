/**
 * notificationRecipients.js — Résolution destinataires DG / Super Admin / RH
 */
import { getSupabase } from '../../lib/supabase';
import { logNotificationDebug } from './notificationDebug';
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
let employeesCache = null;
let employeesCacheAt = 0;
const CACHE_MS = 60_000;

function normalizePersonName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(name) {
  return normalizePersonName(name).split(' ').filter((t) => t.length > 1);
}

/** Correspondance souple : ordre prénom/nom, casse, accents. */
export function personNamesMatch(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length >= 2 && tb.length >= 2) {
    const allInB = ta.every((t) => tb.includes(t));
    const allInA = tb.every((t) => ta.includes(t));
    if (allInB || allInA) return true;
  }
  return na.includes(nb) || nb.includes(na);
}

async function fetchEmployeesForMatching() {
  if (employeesCache && Date.now() - employeesCacheAt < CACHE_MS) return employeesCache;
  const { data, error } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, email, statut');
  if (error) {
    console.warn('[CITYMO] employees for notifications', error);
    return employeesCache || [];
  }
  employeesCache = (data || []).filter(
    (e) => (e.statut || 'Actif').toLowerCase() !== 'inactif',
  );
  employeesCacheAt = Date.now();
  return employeesCache;
}

function employeeDisplayNames(emp) {
  if (!emp) return [];
  const first = (emp.firstname || '').trim();
  const last = (emp.lastname || '').trim();
  return [
    [first, last].filter(Boolean).join(' '),
    [last, first].filter(Boolean).join(' '),
    last,
    first,
  ].filter(Boolean);
}

export async function fetchProfiles() {
  if (profilesCache && Date.now() - profilesCacheAt < CACHE_MS) return profilesCache;
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, email, role, nom, employee_id, role_id, department_id, statut');
  if (error) {
    console.warn('[CITYMO] profiles for notifications', error);
    return profilesCache || [];
  }
  profilesCache = data || [];
  profilesCacheAt = Date.now();
  return profilesCache;
}

export async function listSuperAdminAndDGRecipients() {
  try {
    const { data, error } = await getSupabase().rpc('list_super_admin_dg_user_ids');
    if (!error && Array.isArray(data) && data.length) {
      return data.map((id) => ({ id }));
    }
    if (error && error.code !== 'PGRST202') {
      console.warn('[CITYMO] list_super_admin_dg_user_ids RPC', error);
    }
  } catch (err) {
    console.warn('[CITYMO] list_super_admin_dg_user_ids', err);
  }
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
  try {
    const { data, error } = await getSupabase().rpc('resolve_notification_recipient', {
      p_user_id: userId,
      p_employee_id: null,
      p_email: null,
      p_assignee_name: null,
    });
    if (!error && data === userId) {
      return { id: userId };
    }
  } catch {
    /* fallback */
  }
  const profiles = await fetchProfiles();
  return profiles.find((p) => p.id === userId) || { id: userId };
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
  employeesCache = null;
  employeesCacheAt = 0;
}

async function resolveAssigneeProfileLocal(hints = {}) {
  const {
    userId,
    employeeId,
    email,
    assigneeName,
  } = hints;

  if (userId) {
    const byId = await findProfileById(userId);
    if (byId) return { profile: byId, matchMethod: 'user_id' };
  }

  const profiles = await fetchProfiles();

  if (employeeId) {
    const byEmpLink = profiles.find((p) => p.employee_id === employeeId);
    if (byEmpLink) return { profile: byEmpLink, matchMethod: 'employee_id' };
  }

  if (email) {
    const byEmail = profiles.find(
      (p) => (p.email || '').toLowerCase() === String(email).toLowerCase(),
    );
    if (byEmail) return { profile: byEmail, matchMethod: 'email' };
  }

  if (!assigneeName?.trim()) return { profile: null, matchMethod: null };

  const q = String(assigneeName).trim();
  if (q.includes('@')) {
    const byMail = profiles.find((p) => (p.email || '').toLowerCase() === q.toLowerCase());
    if (byMail) return { profile: byMail, matchMethod: 'assignee_email' };
  }

  const employees = await fetchEmployeesForMatching();
  const emp = employees.find((e) =>
    employeeDisplayNames(e).some((label) => personNamesMatch(label, q)),
  );

  if (emp) {
    const byEmpLink = profiles.find((p) => p.employee_id === emp.id);
    if (byEmpLink) return { profile: byEmpLink, matchMethod: 'employee_name_employee_id' };

    if (emp.email) {
      const byEmpEmail = profiles.find(
        (p) => (p.email || '').toLowerCase() === String(emp.email).toLowerCase(),
      );
      if (byEmpEmail) return { profile: byEmpEmail, matchMethod: 'employee_name_email' };
    }
  }

  const byNom = profiles.find((p) => personNamesMatch(p.nom, q));
  if (byNom) return { profile: byNom, matchMethod: 'profile_nom' };

  return { profile: null, matchMethod: null };
}

/**
 * Résout un assigné → profil utilisateur.
 * Priorité : user_id → employee_id → email → employé RH (nom) → nom profil.
 * Utilise RPC SECURITY DEFINER (contourne RLS profiles).
 */
export async function resolveAssigneeProfile(hints = {}) {
  const assigneeName = hints.assigneeName || hints.assignee || null;
  let employeeId = hints.employeeId || null;

  if (!employeeId && assigneeName?.trim()) {
    const employees = await fetchEmployeesForMatching();
    const emp = employees.find((e) =>
      employeeDisplayNames(e).some((label) => personNamesMatch(label, assigneeName)),
    );
    if (emp?.id) employeeId = emp.id;
  }

  try {
    const { data: userId, error } = await getSupabase().rpc('resolve_notification_recipient', {
      p_user_id: hints.userId || null,
      p_employee_id: employeeId,
      p_email: hints.email || null,
      p_assignee_name: assigneeName,
    });

    if (!error && userId) {
      const profile = await findProfileById(userId) || { id: userId };
      logNotificationDebug('resolveAssignee.rpc', {
        hints,
        recipient_user_id: userId,
        matchMethod: 'rpc',
      });
      return { profile, matchMethod: 'rpc' };
    }

    if (error && error.code !== 'PGRST202') {
      console.warn('[CITYMO] resolve_notification_recipient RPC', error);
    }
  } catch (err) {
    console.warn('[CITYMO] resolve_notification_recipient', err);
  }

  const local = await resolveAssigneeProfileLocal({ ...hints, assigneeName });
  logNotificationDebug('resolveAssignee.local', {
    hints,
    recipient_user_id: local.profile?.id || null,
    matchMethod: local.matchMethod,
  });
  return local;
}

/** Trouve un profil utilisateur par nom affiché (tâche, RDV, assignation). */
export async function findProfileByAssigneeName(assigneeName, extraHints = {}) {
  const { profile } = await resolveAssigneeProfile({
    assigneeName,
    ...extraHints,
  });
  return profile;
}
