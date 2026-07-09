import { proxyToRailway } from './erp-snapshot-proxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return proxyToRailway(req, res, 'backups/status/drive');
}
