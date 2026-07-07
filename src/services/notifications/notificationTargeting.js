/**
 * notificationTargeting.js — Résolution destinataires par département, rôle, rubrique
 */
import { getSupabase } from '../../lib/supabase';
import { invalidateProfilesCache } from './notificationRecipients';
import { logNotificationDebug } from './notificationDebug';

export const NOTIFICATION_DEPARTMENTS = {
  ACHATS: 3,
  RH: 2,
  COMPTABILITE: 6,
  LOGISTIQUE: 9,
  SAV: 8,
  ADMIN: 7,
  EXPLOITATION: 5,
};

export const NOTIFICATION_SUBMODULES = {
  DEMANDES_ACHAT: 'demandes-achat',
  ORDRES_PAIEMENT: 'ordres-paiement',
  CONGES: 'conges',
  FEUILLE_CAISSE: 'feuille-caisse',
  CHARGES: 'charges',
  SAV: 'sav-projets',
  TACHES: 'taches',
  RENDEZ_VOUS: 'rendez-vous',
  DEMANDES_RESSOURCES: 'demandes-ressources',
  DEMANDES_CHANTIER: 'demandes-chantier',
  PAIEMENT_HEBDO: 'paiement-hebdo',
};

let roleDeptCache = null;
let roleDeptCacheAt = 0;
const CACHE_MS = 60_000;

async function fetchRoleDepartmentMap() {
  if (roleDeptCache && Date.now() - roleDeptCacheAt < CACHE_MS) return roleDeptCache;
  const { data, error } = await getSupabase()
    .from('erp_roles')
    .select('id, code, department_id, est_admin');
  if (error) {
    console.warn('[CITYMO] erp_roles for notifications', error);
    return roleDeptCache || new Map();
  }
  const map = new Map();
  (data || []).forEach((r) => map.set(r.id, r));
  roleDeptCache = map;
  roleDeptCacheAt = Date.now();
  return map;
}

export async function fetchProfilesForTargeting() {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, email, role, nom, role_id, department_id, whatsapp_enabled, statut');
  if (error) {
    console.warn('[CITYMO] profiles targeting', error);
    return [];
  }
  return (data || []).filter(
    (p) => (p.statut || 'actif').toLowerCase() !== 'inactif',
  );
}

async function listUserIdsBySubmodule(submoduleCode) {
  if (!submoduleCode) return [];
  const sb = getSupabase();
  const [{ data: perms }, { data: profiles }] = await Promise.all([
    sb.from('role_permissions')
      .select('role_id, submodule_code, module_code, action_code, granted')
      .eq('action_code', 'voir')
      .eq('granted', true),
    sb.from('profiles').select('id, role_id').not('role_id', 'is', null),
  ]);

  const roleIds = new Set();
  (perms || []).forEach((p) => {
    if (p.submodule_code === submoduleCode || p.module_code === submoduleCode) {
      roleIds.add(p.role_id);
    }
  });

  const ids = new Set();
  (profiles || []).forEach((p) => {
    if (roleIds.has(p.role_id)) ids.add(p.id);
  });

  const { data: exc } = await sb
    .from('user_permission_exceptions')
    .select('user_id, submodule_code, action_code, granted')
    .eq('submodule_code', submoduleCode);

  (exc || []).forEach((e) => {
    if (e.action_code === 'voir' && e.granted === true && e.user_id) ids.add(e.user_id);
    if (e.action_code === 'voir' && e.granted === false && e.user_id) ids.delete(e.user_id);
  });

  return [...ids];
}

async function listUserIdsByDepartment(departmentId) {
  if (!departmentId) return [];
  const [profiles, roleMap] = await Promise.all([
    fetchProfilesForTargeting(),
    fetchRoleDepartmentMap(),
  ]);
  const roleIdsForDept = new Set();
  roleMap.forEach((role, id) => {
    if (role.department_id === departmentId) roleIdsForDept.add(id);
  });
  return profiles
    .filter((p) => p.department_id === departmentId || roleIdsForDept.has(p.role_id))
    .map((p) => p.id);
}

async function listUserIdsByRoleId(roleId) {
  if (!roleId) return [];
  const profiles = await fetchProfilesForTargeting();
  return profiles.filter((p) => p.role_id === roleId).map((p) => p.id);
}

async function listUserIdsByRoleCode(roleCode) {
  if (!roleCode) return [];
  const roleMap = await fetchRoleDepartmentMap();
  const roleId = [...roleMap.entries()].find(([, r]) => r.code === roleCode)?.[0];
  if (!roleId) return [];
  return listUserIdsByRoleId(roleId);
}

/**
 * @param {object} targeting
 * @param {string[]} [targeting.userIds]
 * @param {number} [targeting.departmentId]
 * @param {string} [targeting.roleId]
 * @param {string} [targeting.roleCode]
 * @param {string} [targeting.submoduleCode]
 * @param {string[]} [targeting.excludeUserIds]
 */
export async function resolveNotificationRecipients(targeting = {}) {
  const {
    userIds = [],
    departmentId = null,
    roleId = null,
    roleCode = null,
    submoduleCode = null,
    excludeUserIds = [],
  } = targeting;

  const exclude = new Set(excludeUserIds.filter(Boolean));

  try {
    let resolvedRoleId = roleId;
    if (!resolvedRoleId && roleCode) {
      const roleMap = await fetchRoleDepartmentMap();
      resolvedRoleId = [...roleMap.entries()].find(([, r]) => r.code === roleCode)?.[0] || null;
    }

    const { data, error } = await getSupabase().rpc('list_notification_target_user_ids', {
      p_department_id: departmentId || null,
      p_submodule_code: submoduleCode || null,
      p_role_id: resolvedRoleId || null,
      p_user_ids: userIds.length ? userIds : null,
    });

    if (!error && Array.isArray(data)) {
      const ids = data.filter((id) => id && !exclude.has(id));
      logNotificationDebug('resolveRecipients.rpc', { targeting, userIds: ids });
      return ids;
    }

    if (error && error.code !== 'PGRST202') {
      console.warn('[CITYMO] list_notification_target_user_ids RPC', error);
    }
  } catch (err) {
    console.warn('[CITYMO] list_notification_target_user_ids', err);
  }

  const resolved = new Set(userIds.filter(Boolean));

  const batches = await Promise.all([
    departmentId ? listUserIdsByDepartment(departmentId) : [],
    roleId ? listUserIdsByRoleId(roleId) : [],
    roleCode ? listUserIdsByRoleCode(roleCode) : [],
    submoduleCode ? listUserIdsBySubmodule(submoduleCode) : [],
  ]);

  if (userIds.length || departmentId || roleId || roleCode || submoduleCode) {
    batches.forEach((batch) => batch.forEach((id) => resolved.add(id)));
  }

  const ids = [...resolved].filter((id) => !exclude.has(id));
  logNotificationDebug('resolveRecipients.local', { targeting, userIds: ids });
  return ids;
}

export function invalidateTargetingCache() {
  roleDeptCache = null;
  roleDeptCacheAt = 0;
  invalidateProfilesCache();
}
