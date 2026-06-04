/**
 * Vercel Serverless — POST /api/ocr/moroccan-cin
 * Body JSON: { recto?: dataUrl, verso?: dataUrl }
 * Variables Vercel : MINDEE_API_KEY, MINDEE_MODEL_ID (si clé md_*)
 */
import { dataUrlToBuffer, processMoroccanCinBuffers } from '../../lib/mindeeMoroccanCin.mjs';

export const config = {
  maxDuration: 60,
};

function readJsonBody(req) {
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

  try {
    const body = await readJsonBody(req);
    const rectoBuf = body.recto ? dataUrlToBuffer(body.recto) : null;
    const versoBuf = body.verso ? dataUrlToBuffer(body.verso) : null;

    if (!rectoBuf?.length && !versoBuf?.length) {
      return res.status(400).json({ success: false, error: 'Au moins recto ou verso requis.' });
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
