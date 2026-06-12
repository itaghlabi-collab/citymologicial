/**
 * executiveCalendarAccess.js — Droits Agenda de Direction
 */

function normRole(user) {
  return (user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Email DG — accès complet Agenda de Direction */
export const DG_EMAIL = 'selim.moumni@citymo.ma';

const WRITE_ROLES = new Set([
  'admin',
  'administrateur',
  'super admin',
  'super_admin',
  'assistante de direction',
  'assistante direction',
  'directeur general',
  'directeur_general',
  'dg',
]);

const READ_ROLES = new Set([...WRITE_ROLES]);

export function canAccessExecutiveCalendar(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  if (email === DG_EMAIL) return true;
  return READ_ROLES.has(normRole(user));
}

export function canWriteExecutiveCalendar(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  if (email === DG_EMAIL) return true;
  return WRITE_ROLES.has(normRole(user));
}

export function isExecutiveCalendarReadOnly(user) {
  return canAccessExecutiveCalendar(user) && !canWriteExecutiveCalendar(user);
}
