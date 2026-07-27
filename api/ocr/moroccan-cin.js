/**
 * Vercel serverless — proxy HTTP vers le service OCR Python (OCR_SERVICE_URL)
 * ou vers l'API Express Railway (RAILWAY_API_URL).
 * Les modèles PP-OCRv5 ne tournent pas sur Vercel.
 */
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 90000);

function resolveOcrAnalyzeUrl() {
  const direct = (process.env.OCR_SERVICE_URL || '').replace(/\/$/, '');
  if (direct) return `${direct}/analyze`;
  const railway = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
  if (railway) {
    // Express proxy sur Railway
    return `${railway}/api/ocr/moroccan-cin`;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const target = resolveOcrAnalyzeUrl();
  if (!target) {
    return res.status(503).json({
      ok: false,
      error: 'Service OCR indisponible',
      error_code: 'OCR_NOT_CONFIGURED',
      _ocr_warning: 'Configurez OCR_SERVICE_URL ou RAILWAY_API_URL sur Vercel.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        recto: body.recto,
        verso: body.verso || null,
        force: !!body.force,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: 'Service OCR indisponible', error_code: 'OCR_UNAVAILABLE' };
    }
    res.status(upstream.status >= 400 ? upstream.status : 200).json(data);
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    res.status(timedOut ? 504 : 503).json({
      ok: false,
      error: timedOut ? "Temps d'analyse dépassé" : 'Service OCR indisponible',
      error_code: timedOut ? 'OCR_TIMEOUT' : 'OCR_UNAVAILABLE',
      _ocr_warning: 'Saisissez les champs manuellement.',
    });
  }
};
