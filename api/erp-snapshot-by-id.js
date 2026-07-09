import { proxyToRailway } from '../lib/railwayProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const { id, action } = req.query;
  const suffix = action ? `${id}/${action}` : String(id || '');
  return proxyToRailway(req, res, `backups/${suffix}`);
}
