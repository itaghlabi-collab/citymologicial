import { proxyToRailway } from './erp-snapshot-proxy.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const { id, action } = req.query;
  const suffix = action ? `${id}/${action}` : String(id || '');
  return proxyToRailway(req, res, `backups/${suffix}`);
}
