/**
 * Serveur OCR standalone — sans SQLite (pour dev / Node 24+)
 * Usage: node ocr-server.js  ou  npm run start:ocr
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const ocrRouter = require('./routes/ocr');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    cb(null, true); // dev: autoriser toutes origines pour mobile LAN
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CITYMO OCR', ts: new Date().toISOString() });
});

app.use('/api/ocr', ocrRouter);

app.listen(PORT, '0.0.0.0', () => {
  const v2 = String(process.env.MINDEE_API_KEY || '').startsWith('md_');
  console.log(`\n  [OCR CIN] API ready → http://0.0.0.0:${PORT}/api/ocr/moroccan-cin\n`);
  console.info('[OCR CIN] config', {
    OCR_PROVIDER: process.env.OCR_PROVIDER || 'mindee',
    mindee_v2: v2,
    has_api_key: Boolean(process.env.MINDEE_API_KEY),
    has_model_id: Boolean(resolveModelIdForLog()),
    endpoint: v2
      ? 'https://api-v2.mindee.net/v2/products/extraction/enqueue'
      : 'https://api.mindee.net/v1/products/mindee/international_id/v2/predict',
  });
  if (v2 && !resolveModelIdForLog()) {
    console.warn('[OCR CIN] Model ID manquant — ajoutez MINDEE_MODEL_ID ou MINDEE_MODEL_URL dans server/.env');
    console.warn('[OCR CIN] Live Test URL: copiez l\'URL du navigateur (contient /models/{uuid}/...)');
  }
});

function resolveModelIdForLog() {
  const direct = (process.env.MINDEE_MODEL_ID || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(direct)) return direct;
  const fromUrl = (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').trim();
  const match = fromUrl.match(/\/models\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}
