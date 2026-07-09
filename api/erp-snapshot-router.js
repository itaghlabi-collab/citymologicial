export const config = { maxDuration: 60 };

function resolveRailwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || '';
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.replace(/\/api$/, '');
}

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
  const base = resolveRailwayBase();
  if (!base) {
    return res.status(503).json({
      error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
    });
  }

  const path = resolveBackupPath(req).replace(/^\/+/, '');
  const headers = {};
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  const method = req.method || 'GET';
  const init = { method, headers };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && req.body != null) {
    init.body = typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body);
  }

  const upstream = await globalThis.fetch(`${base}/api/${path}`, init);
  const contentType = upstream.headers.get('content-type') || 'application/json';
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  if (!text) return res.end();
  return res.send(text);
}
