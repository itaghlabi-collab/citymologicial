/**
 * Vercel — proxy /api/admin/users/* → Railway (sauf password → route dédiée)
 */
import { proxyToRailway } from '../../../lib/railwayProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const parts = Array.isArray(segments) ? segments : [String(segments)];
  const suffix = parts.join('/');

  return proxyToRailway(req, res, `admin/users/${suffix}`);
}
