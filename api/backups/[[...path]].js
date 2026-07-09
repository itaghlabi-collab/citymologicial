/**
 * Vercel — proxy /api/backups et /api/backups/* → Railway
 * Optional catch-all : gère POST /api/backups et sous-routes multi-segments.
 */
import { proxyToRailway } from '../../lib/railwayProxy.mjs';

export const config = { maxDuration: 300 };

function backupApiPath(segments) {
  if (segments == null || segments === '') return 'backups';
  const parts = Array.isArray(segments)
    ? segments
    : String(segments).split('/').filter((s) => s.length > 0);
  const suffix = parts.filter((s) => s != null && String(s).length > 0).join('/');
  return suffix ? `backups/${suffix}` : 'backups';
}

export default async function handler(req, res) {
  const segments = req.query.path ?? req.query['...path'];
  return proxyToRailway(req, res, backupApiPath(segments));
}
