/**
 * Vercel — proxy unique /api/backups* → Railway
 */
export const config = { maxDuration: 60 };

function resolveRailwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || process.env.VITE_API_URL
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

async function readBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  const base = resolveRailwayBase();
  if (!base) {
    return res.status(503).json({
      error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
    });
  }

  const path = resolveBackupPath(req).replace(/^\/+/, '');
  const targetUrl = `${base}/api/${path}`;

  const headers = {};
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  const method = req.method || 'GET';
  const init = { method, headers };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    init.body = await readBody(req);
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);

    const text = await upstream.text();
    if (!text) return res.end();

    if (contentType.includes('application/json')) {
      try {
        return res.json(JSON.parse(text));
      } catch {
        /* fall through */
      }
    }
    return res.send(text);
  } catch (err) {
    console.error('[erp-snapshot-router]', path, err.message);
    return res.status(502).json({ error: `Proxy Railway : ${err.message}` });
  }
}
