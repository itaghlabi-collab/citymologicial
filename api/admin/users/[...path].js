/**
 * Vercel — proxy /api/admin/users/* → Railway
 */
import { proxyToRailway } from '../../../lib/railwayProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const suffix = Array.isArray(segments) ? segments.join('/') : String(segments);
  return proxyToRailway(req, res, `admin/users/${suffix}`);
}
