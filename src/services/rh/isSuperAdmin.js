/** Super Admin principal + rôle profiles.super_admin */
export const SUPER_ADMIN_EMAIL = 'selim.moumni@citymo.ma';

export function isSuperAdmin(user) {
  if (!user) return false;
  if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  const role = (user.role || '').toLowerCase().replace(/\s+/g, '_');
  return role === 'super_admin';
}
