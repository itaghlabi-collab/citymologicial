/**
 * taskDgPushAccess.js — Qui peut activer/désactiver Push DG sur les tâches
 */
import { DG_EMAIL } from './executiveCalendarAccess';

function normRole(user) {
  return (user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MANAGE_ROLES = new Set([
  'admin',
  'administrateur',
  'super admin',
  'super_admin',
  'directeur general',
  'directeur_general',
  'dg',
]);

export function canManageTaskDgPush(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  if (email === DG_EMAIL || email === 'selim.moumni@gmail.com') return true;
  return MANAGE_ROLES.has(normRole(user));
}
