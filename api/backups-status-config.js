import { proxyToRailway } from '../lib/railwayProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return proxyToRailway(req, res, 'backups/status/config');
}
