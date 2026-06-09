/**
 * Vercel Serverless — POST /api/ocr/moroccan-cin
 * Body JSON: { recto?: dataUrl, verso?: dataUrl }
 * Variables Vercel : MINDEE_API_KEY, MINDEE_MODEL_ID (si clé md_*)
 */
import { dataUrlToBuffer, processMoroccanCinBuffers } from '../../lib/mindeeMoroccanCin.mjs';

export const config = {
  maxDuration: 60,
};

async function parseRequestBody(req) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const hasKey = Boolean(process.env.MINDEE_API_KEY);
  const key = process.env.MINDEE_API_KEY || '';
  const ocrProvider = (process.env.OCR_PROVIDER || 'mindee').toLowerCase();
  const isMd = key.startsWith('md_');
  const hasModelId = Boolean(
    (process.env.MINDEE_MODEL_ID || '').trim().match(/^[0-9a-f-]{36}$/i)
    || (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').match(/\/models\/([0-9a-f-]{36})/i),
  );
  console.info('[OCR CIN] server request', {
    OCR_PROVIDER: ocrProvider,
    key_type: !hasKey ? 'missing' : (isMd ? 'md_v2' : 'legacy_v1'),
    has_MINDEE_MODEL_ID: hasModelId,
    mindee_api_key: hasKey ? 'present' : 'MISSING',
    endpoint_planned: isMd && !hasModelId
      ? null
      : (isMd ? 'https://api-v2.mindee.net/v2/products/extraction/enqueue' : 'https://api.mindee.net/v1/products/mindee/international_id/v2/predict'),
  });
  if (isMd && !hasModelId) {
    console.error('[OCR CIN] MINDEE_MODEL_ID manquant — aucun appel Mindee (clé md_*)');
  }

  try {
    const body = await parseRequestBody(req);
    let rectoBuf = null;
    let versoBuf = null;
    try {
      if (body.recto) rectoBuf = dataUrlToBuffer(body.recto);
      if (body.verso) versoBuf = dataUrlToBuffer(body.verso);
    } catch (decodeErr) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_IMAGE',
        allowFallback: true,
        error: decodeErr.message || 'Image invalide.',
      });
    }

    if (!rectoBuf?.length && !versoBuf?.length) {
      return res.status(400).json({ success: false, error: 'Au moins recto ou verso requis.' });
    }

    console.info('[OCR CIN] payload images', {
      recto_sent: Boolean(rectoBuf?.length),
      verso_sent: Boolean(versoBuf?.length),
      recto_bytes: rectoBuf?.length || 0,
      verso_bytes: versoBuf?.length || 0,
      recto_mime: rectoBuf?.length ? (rectoBuf[0] === 0xff ? 'jpeg' : rectoBuf[0] === 0x89 ? 'png' : 'unknown') : null,
      verso_mime: versoBuf?.length ? (versoBuf[0] === 0xff ? 'jpeg' : versoBuf[0] === 0x89 ? 'png' : 'unknown') : null,
    });

    const totalBytes = (rectoBuf?.length || 0) + (versoBuf?.length || 0);
    if (totalBytes > 4_200_000) {
      return res.status(413).json({
        success: false,
        code: 'PAYLOAD_TOO_LARGE',
        allowFallback: true,
        error: 'Images trop lourdes pour le serveur — réessayez ou utilisez le fallback local.',
      });
    }

    const result = await processMoroccanCinBuffers({ rectoBuf, versoBuf });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[OCR CIN] Vercel API', err.message);
    return res.status(200).json({
      success: false,
      code: err.code || 'OCR_ERROR',
      allowFallback: true,
      error: err.message,
    });
  }
}
