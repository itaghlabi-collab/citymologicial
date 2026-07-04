/**
 * Vercel — POST /api/admin-user-email?id=:userId
 * Synchronise auth.users.email avec le profil ERP.
 */
import { handleAdminSyncEmail } from '../lib/adminSetPasswordVercel.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const userId = req.query.id || req.query.userId;
  return handleAdminSyncEmail(req, res, userId);
}
