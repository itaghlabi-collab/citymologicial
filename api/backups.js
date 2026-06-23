/**
 * Vercel — proxy POST/GET /api/backups → Railway
 */
import { proxyToRailway } from '../lib/railwayProxy.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  return proxyToRailway(req, res, 'backups');
}
