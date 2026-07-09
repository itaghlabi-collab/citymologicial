/**
 * Proxy sauvegardes Vercel → Railway (pattern identique à adminSetPasswordVercel).
 */

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

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export async function handleErpSnapshotProxy(req, res) {
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
    const body = await readJsonBody(req);
    init.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    if (!text) return res.end();
    return res.send(text);
  } catch (err) {
    console.error('[erpSnapshotProxy]', path, err.message);
    return res.status(502).json({ error: `Proxy Railway : ${err.message}` });
  }
}
