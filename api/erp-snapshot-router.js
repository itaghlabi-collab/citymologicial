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

function readBody(req) {
  if (req.body != null && typeof req.body === 'object') {
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || ''));
    req.on('error', reject);
  });
}

function requestRailway(https, URL, targetUrl, init) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method || 'GET',
      headers: init.headers || {},
    }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => chunks.push(chunk));
      upstream.on('end', () => {
        resolve({
          status: upstream.statusCode || 502,
          contentType: upstream.headers['content-type'] || 'application/json',
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

export default async function handler(req, res) {
  try {
    const base = resolveRailwayBase();
    if (!base) {
      return res.status(503).json({
        error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
      });
    }

    const [{ default: https }, { URL }] = await Promise.all([
      import('node:https'),
      import('node:url'),
    ]);

    const path = resolveBackupPath(req).replace(/^\/+/, '');
    const headers = {};
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    const method = req.method || 'GET';
    const init = { method, headers };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      init.body = await readBody(req);
    }

    const upstream = await requestRailway(https, URL, `${base}/api/${path}`, init);
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.contentType);
    if (!upstream.body) return res.end();
    return res.send(upstream.body);
  } catch (err) {
    console.error('[erp-snapshot-router]', err);
    return res.status(500).json({ error: err.message || 'Proxy Railway échoué' });
  }
}
