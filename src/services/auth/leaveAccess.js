/**
 * leaveAccess.js — Gestion RH des demandes de congé (tous employés, validation)
 */
import { isSuperAdmin } from '../rh/isSuperAdmin';
import { can } from '../admin/permissions';

/** Accès gestion complète : super admin ou RH avec employés + congés */
export async function canManageLeaves(user) {
  if (!user?.id) return false;
  if (isSuperAdmin(user)) return true;

  const [hasEmployes, hasConges] = await Promise.all([
    can(user, 'employes', 'voir'),
    can(user, 'conges', 'voir'),
  ]);

  return hasEmployes && hasConges;
}

/** Dérogation solde insuffisant : super admin ou RH gestionnaire. */
export async function canOverrideLeaveBalance(user) {
  if (!user?.id) return false;
  if (isSuperAdmin(user)) return true;
  return canManageLeaves(user);
}
