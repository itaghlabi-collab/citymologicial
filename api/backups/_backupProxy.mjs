import { proxyToRailway } from '../../lib/railwayProxy.mjs';

export function proxyBackup(req, res, suffix = '') {
  const path = suffix ? `backups/${String(suffix).replace(/^\/+/, '')}` : 'backups';
  return proxyToRailway(req, res, path);
}
