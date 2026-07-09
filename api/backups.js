/**
 * Vercel — proxy /api/backups et /api/backups/* → Railway
 * Handler unique : les catch-all [[...path]] ne sont pas supportés hors Next.js sur /api.
 */
import { proxyToRailway } from '../lib/railwayProxy.mjs';

export const config = { maxDuration: 300 };

function backupApiPath(segments) {
  if (segments == null || segments === '') return 'backups';
  const parts = Array.isArray(segments)
    ? segments
    : String(segments).split('/').filter((s) => s.length > 0);
  const suffix = parts.join('/');
  return suffix ? `backups/${suffix}` : 'backups';
}

export default async function handler(req, res) {
  let segments = req.query.path;
  if (!segments && req.url) {
    const match = req.url.match(/^\/api\/backups\/?([^?]*)/);
    if (match?.[1]) segments = match[1];
  }
  return proxyToRailway(req, res, backupApiPath(segments));
}
