/** Super Admin principal + rôle profiles.super_admin */
export const SUPER_ADMIN_EMAIL = 'selim.moumni@citymo.ma';

export function isSuperAdmin(user) {
  if (!user) return false;
  const email = user.email?.toLowerCase();
  if (email === SUPER_ADMIN_EMAIL || email === 'selim.moumni@gmail.com') return true;
  const role = (user.role || '').toLowerCase().replace(/\s+/g, '_');
  return role === 'super_admin';
}
