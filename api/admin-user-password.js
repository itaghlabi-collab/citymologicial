/**
 * Vercel — POST /api/admin-user-password?id=:userId
 * Réécrit depuis /api/admin/users/:id/password (vercel.json).
 */
import { handleAdminSetPassword } from '../lib/adminSetPasswordVercel.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const userId = req.query.id || req.query.userId;
  return handleAdminSetPassword(req, res, userId);
}
