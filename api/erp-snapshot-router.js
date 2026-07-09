export const config = { runtime: 'edge' };

function resolveRailwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || process.env.VITE_API_URL
    || '';
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.replace(/\/api$/, '');
}

function resolveBackupPath(url) {
  const route = url.searchParams.get('route');
  if (route) return `backups/${route.replace(/^\/+/, '')}`;
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');
  if (id) return action ? `backups/${id}/${action}` : `backups/${id}`;
  return 'backups';
}

export default async function handler(request) {
  const base = resolveRailwayBase();
  if (!base) {
    return Response.json(
      { error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.' },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const path = resolveBackupPath(incoming);
  const target = `${base}/api/${path}`;

  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');
  if (authorization) headers.set('authorization', authorization);
  if (contentType) headers.set('content-type', contentType);

  const init = { method: request.method, headers };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    init.body = await request.text();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) responseHeaders.set('content-type', upstreamType);

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}
