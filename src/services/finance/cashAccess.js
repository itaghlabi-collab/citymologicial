/**
 * cashAccess.js — Droits feuille de caisse (DG / Super Admin)
 */
import { isSuperAdmin } from '../rh/isSuperAdmin';
import { canWriteExecutiveCalendar, DG_EMAIL } from '../auth/executiveCalendarAccess';

export function canManageCash(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (canWriteExecutiveCalendar(user)) return true;
  const email = (user.email || '').toLowerCase();
  return email === DG_EMAIL;
}

export function isDGUser(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  return email === DG_EMAIL || isSuperAdmin(user);
}
