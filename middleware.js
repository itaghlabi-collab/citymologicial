function resolveRailwayBase() {
  const raw = process.env.RAILWAY_API_URL
    || process.env.CITYMO_API_URL
    || process.env.VITE_API_URL
    || '';
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.replace(/\/api$/, '');
}

export const config = {
  matcher: ['/api/backups', '/api/backups/:path*'],
};

export default async function middleware(request) {
  const base = resolveRailwayBase();
  if (!base) {
    return Response.json(
      { error: 'API Railway non configurée. Définissez RAILWAY_API_URL sur Vercel.' },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${base}${incoming.pathname}${incoming.search}`);

  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');
  if (authorization) headers.set('authorization', authorization);
  if (contentType) headers.set('content-type', contentType);

  const init = {
    method: request.method,
    headers,
  };

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
