/**
 * purchaseWorkflowRoles.js — Rôles métier workflow Achats
 */
import { getSupabase } from '../../lib/supabase';
import { DG_EMAIL } from '../auth/executiveCalendarAccess';
import { SUPER_ADMIN_EMAIL } from '../rh/isSuperAdmin';

const DG_EMAILS = new Set([DG_EMAIL.toLowerCase(), 'selim.moumni@gmail.com', SUPER_ADMIN_EMAIL.toLowerCase()]);

export const PURCHASE_ROLES = {
  DG: 'dg',
  CHARGEE_ACHATS: 'chargee_achats',
  CHEF_PROJET: 'chef_projet',
  MAGASINIER: 'magasinier',
  OTHER: 'other',
};

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

function normRole(role) {
  return norm(role).replace(/\s+/g, '_');
}

export function detectPurchaseRoleFromProfile(profile, user) {
  const email = (user?.email || profile?.email || '').toLowerCase();
  if (DG_EMAILS.has(email)) return PURCHASE_ROLES.DG;

  const role = normRole(profile?.role);
  const nom = norm(profile?.nom);

  if (role.includes('dg') || role.includes('directeur')) return PURCHASE_ROLES.DG;
  if (role.includes('achat') || nom.includes('laila') && nom.includes('wotfi')) return PURCHASE_ROLES.CHARGEE_ACHATS;
  if (role.includes('chef_projet') || role.includes('chef') && role.includes('projet')) return PURCHASE_ROLES.CHEF_PROJET;
  if (role.includes('magasin') || role.includes('inventaire') || role.includes('depot') || role.includes('logistique')) {
    return PURCHASE_ROLES.MAGASINIER;
  }
  if (role.includes('super_admin') || role === 'super_admin') return PURCHASE_ROLES.DG;

  return PURCHASE_ROLES.OTHER;
}

export async function resolveCurrentPurchaseRole(user) {
  if (!user?.id) return PURCHASE_ROLES.OTHER;
  try {
    const { data } = await getSupabase()
      .from('profiles')
      .select('id, email, role, nom')
      .eq('id', user.id)
      .maybeSingle();
    return detectPurchaseRoleFromProfile(data, user);
  } catch {
    return detectPurchaseRoleFromProfile(null, user);
  }
}

export function purchasePermissions(role) {
  const r = role || PURCHASE_ROLES.OTHER;
  const isDg = r === PURCHASE_ROLES.DG;
  const isChargee = r === PURCHASE_ROLES.CHARGEE_ACHATS;
  const isDemandeur = r === PURCHASE_ROLES.CHEF_PROJET || r === PURCHASE_ROLES.MAGASINIER;
  const canCreate = isDg || isChargee || isDemandeur || r === PURCHASE_ROLES.OTHER;

  return {
    role: r,
    canCreateRequest: canCreate,
    canViewAll: isDg || isChargee,
    canManageQuotes: isChargee || isDg,
    canSendToDg: isChargee,
    canValidateSupplier: isDg,
    canValidateOa: isDg,
    canValidatePayment: isDg,
    canMarkReceived: isChargee || isDg,
    canClose: isChargee || isDg,
  };
}

export function canViewPurchaseRequest(request, user, role) {
  if (!request) return false;
  const perms = purchasePermissions(role);
  if (perms.canViewAll) return true;
  return request.requester_user_id === user?.id || request.created_by === user?.id;
}
