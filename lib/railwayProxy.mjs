/**
 * Proxy Vercel → API Railway (sauvegardes, admin utilisateurs).
 * Variable Vercel : RAILWAY_API_URL=https://xxx.railway.app (sans /api)
 */

function resolveRailwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || '';
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.replace(/\/api$/, '');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return JSON.stringify(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || ''));
    req.on('error', reject);
  });
}

export async function proxyToRailway(req, res, apiPath) {
  const base = resolveRailwayBase();
  if (!base) {
    return res.status(503).json({
      error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.',
    });
  }

  const path = String(apiPath || '').replace(/^\/+/, '');
  const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${base}/api/${path}${query}`;

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
    if (text) {
      if (contentType.includes('application/json')) {
        try {
          return res.json(JSON.parse(text));
        } catch {
          /* fall through */
        }
      }
      return res.send(text);
    }
    return res.end();
  } catch (err) {
    console.error('[railwayProxy]', path, err.message);
    return res.status(502).json({ error: `Proxy Railway : ${err.message}` });
  }
}
