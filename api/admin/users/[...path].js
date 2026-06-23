/**
 * Vercel — POST /api/admin/users/:id/password (natif, sans Railway)
 * Autres routes → proxy Railway si RAILWAY_API_URL configuré.
 */
import { handleAdminSetPassword } from '../../../lib/adminSetPasswordVercel.mjs';
import { proxyToRailway } from '../../../lib/railwayProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const parts = Array.isArray(segments) ? segments : [String(segments)];
  const suffix = parts.join('/');

  const isPasswordRoute = req.method === 'POST' && parts.length === 2 && parts[1] === 'password';
  if (isPasswordRoute) {
    return handleAdminSetPassword(req, res, parts[0]);
  }

  return proxyToRailway(req, res, `admin/users/${suffix}`);
}
