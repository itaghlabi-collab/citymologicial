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
  return res.status(200).json({
    path: resolveBackupPath(req),
    method: req.method,
  });
}
