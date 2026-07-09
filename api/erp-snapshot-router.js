export const config = { maxDuration: 60 };

function resolveBackupPath(req) {
  const route = req.query.route;
  if (route != null && String(route).length > 0) {
    return `backups/${String(route).replace(/^\/+/, '')}`;
  }
  const { id, action } = req.query;
  if (id) return action ? `backups/${id}/${action}` : `backups/${id}`;
  return 'backups';
}

export default async function handler(req, res) {
  const path = resolveBackupPath(req);
  try {
    const { proxyToRailway } = await import('../lib/railwayProxy.mjs');
    return proxyToRailway(req, res, path);
  } catch (err) {
    console.error('[erp-snapshot-router]', err);
    return res.status(500).json({ error: err.message || 'Proxy Railway échoué' });
  }
}
