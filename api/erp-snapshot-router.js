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

export default async function handler(req, res) {
  try {
    const base = resolveRailwayBase();
    if (!base) {
      return res.status(503).json({
        error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
      });
    }

    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const https = require('node:https');
    const { URL } = require('node:url');

    const path = resolveBackupPath(req).replace(/^\/+/, '');
    const headers = {};
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    const method = req.method || 'GET';
    const body = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? await readBody(req) : '';

    const upstream = await new Promise((resolve, reject) => {
      const parsed = new URL(`${base}/api/${path}`);
      const request = https.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode || 502,
            contentType: response.headers['content-type'] || 'application/json',
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.contentType);
    if (!upstream.body) return res.end();
    return res.send(upstream.body);
  } catch (err) {
    console.error('[erp-snapshot-router]', err);
    return res.status(500).json({ error: err.message || 'Proxy Railway échoué' });
  }
}
