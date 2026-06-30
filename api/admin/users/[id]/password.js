/**
 * Vercel — POST /api/admin/users/:id/password
 * Route dédiée (le catch-all [...path] ne matche qu'un seul segment sur Vercel).
 */
import { handleAdminSetPassword } from '../../../../lib/adminSetPasswordVercel.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const userId = req.query.id;
  return handleAdminSetPassword(req, res, userId);
}
