/**
 * CITYMO ERP – OCR Route
 * POST /api/ocr/moroccan-cin
 *
 * Clé md_* → Mindee API v2 (extraction/enqueue + model_id UUID)
 * Clé re_* → Mindee API v1 (international_id/v2/predict, sans model_id)
 */
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const { pathToFileURL } = require('url');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(name)) {
      return cb(null, true);
    }
    cb(new Error('Seules les images sont acceptees (jpeg, png, webp, heic).'));
  },
});

const MINDEE_V1_INTERNATIONAL_ID = process.env.MINDEE_ENDPOINT
  || 'https://api.mindee.net/v1/products/mindee/international_id/v2/predict';
const MINDEE_V2_EXTRACTION_ENQUEUE = 'https://api-v2.mindee.net/v2/products/extraction/enqueue';
const MINDEE_V2_JOBS_BASE = 'https://api-v2.mindee.net/v2/jobs';

const MOCK_RECTO = {
  fields: {
    sex: { value: 'F', confidence: 0.98 },
    address: { fields: { city: { value: 'CASABLANCA' }, country: { value: 'MAROC' } } },
    surnames: [{ value: 'ELOUADOUD', confidence: 0.99 }],
    given_names: [{ value: 'JIHANE', confidence: 0.99 }],
    nationality: { value: 'MAROC' },
    date_of_birth: { value: '2003-03-26' },
    place_of_birth: { value: 'SIDI OTHMANE CASABLANCA' },
    date_of_expiry: { value: '2029-11-25' },
    document_number: { value: 'BA21889', confidence: 0.99 },
  },
};

const MOCK_VERSO = {
  fields: {
    address: {
      fields: {
        street: { value: '14 BLOC 28 SID OTHMANE' },
        city: { value: 'CASABLANCA' },
      },
    },
  },
};

let _cinOcrModule = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMindeeV2Key(key) {
  return typeof key === 'string' && key.startsWith('md_');
}

function mindeeAuthHeader(apiKey) {
  if (isMindeeV2Key(apiKey)) return { Authorization: apiKey };
  return { Authorization: `Token ${apiKey}` };
}

/**
 * Model ID v2 = UUID généré quand vous créez le modèle "International ID" dans le dashboard.
 * Ce n'est PAS l'Organization ID.
 *
 * Sources acceptées :
 * 1. MINDEE_MODEL_ID=uuid
 * 2. MINDEE_MODEL_URL ou MINDEE_LIVE_TEST_URL contenant /models/{uuid}/...
 */
function resolveMindeeModelId() {
  const direct = (process.env.MINDEE_MODEL_ID || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(direct)) return direct;

  const fromUrl = (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').trim();
  const match = fromUrl.match(/\/models\/([0-9a-f-]{36})/i);
  if (match) return match[1];

  return null;
}

function resolveMindeeRouting(apiKey) {
  if (isMindeeV2Key(apiKey)) {
    return {
      version: 'v2',
      endpoint: MINDEE_V2_EXTRACTION_ENQUEUE,
      label: 'Mindee v2 Extraction (International ID)',
    };
  }
  return {
    version: 'v1',
    endpoint: MINDEE_V1_INTERNATIONAL_ID,
    label: 'Mindee v1 International ID',
  };
}

function modelIdHelpMessage() {
  return [
    'Model ID requis pour la clé md_* (API v2).',
    'Ce n\'est pas l\'Organization ID.',
    'Mindee Dashboard → Models → votre modèle "International ID" →',
    'Settings (⚙) → copier "Model ID",',
    'OU coller l\'URL Live Test dans MINDEE_MODEL_URL (ex: .../models/{uuid}/live-test).',
  ].join(' ');
}

async function getCinOcrModule() {
  if (!_cinOcrModule) {
    _cinOcrModule = await import(pathToFileURL(path.join(__dirname, '../../src/services/cinOcr.js')));
  }
  return _cinOcrModule;
}

async function logMappedSide(fields, side) {
  if (!fields || !Object.keys(fields).length) return null;
  try {
    const { mapMindeeFields } = await getCinOcrModule();
    const mapped = mapMindeeFields(fields, side);
    console.info('[OCR CIN] mapped result', { side, mapped });
    return mapped;
  } catch (err) {
    console.warn('[OCR CIN] mapped result skipped', err.message);
    return null;
  }
}

function assertRectoExtracted(mapped, label) {
  if (label !== 'recto' || !mapped) return;
  if (!mapped.numero_cin && !mapped.prenom && !mapped.nom) {
    const err = new Error('Mindee: extraction recto vide — fallback Tesseract.');
    err.code = 'MINDEE_EMPTY_EXTRACTION';
    throw err;
  }
}

/** Extrait fields depuis réponse Mindee v1 ou v2. */
function extractFieldsFromInference(json) {
  if (!json || typeof json !== 'object') return null;

  const candidates = [
    json?.inference?.result?.fields,
    json?.document?.inference?.result?.fields,
    json?.document?.inference?.prediction,
    json?.inference?.prediction,
    json?.inference?.result?.prediction,
    json?.prediction,
    json?.result?.fields,
    json?.fields,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.keys(candidate).length > 0) {
      return candidate;
    }
  }

  return null;
}

async function mindeeV1Predict(buffer, mime, label, endpoint) {
  const apiKey = process.env.MINDEE_API_KEY;
  const https = require('https');
  const { URL } = require('url');

  console.info('[OCR CIN] provider=mindee');
  console.info('[OCR CIN] endpoint used=' + endpoint);

  const boundary = `----CitymoBoundary${Date.now()}`;
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const partHead = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${label}.${ext}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`,
  );
  const partTail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([partHead, buffer, partTail]);

  const parsed = new URL(endpoint);
  const rawResponse = await new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({
      method: 'POST',
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      headers: {
        ...mindeeAuthHeader(apiKey),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  let json;
  try { json = JSON.parse(rawResponse.text); } catch {
    throw new Error(`Mindee v1: reponse non-JSON (HTTP ${rawResponse.status})`);
  }
  if (rawResponse.status !== 201 && rawResponse.status !== 200) {
    const detail = json?.api_request?.error?.message || json?.message || rawResponse.text;
    throw new Error(`Mindee v1 erreur ${rawResponse.status}: ${detail}`);
  }

  const fields = extractFieldsFromInference(json);
  if (!fields || !Object.keys(fields).length) {
    throw new Error('Mindee v1: aucun champ extrait.');
  }

  console.info('[OCR CIN] Mindee response OK', { side: label, fieldKeys: Object.keys(fields) });
  const mapped = await logMappedSide(fields, label === 'verso' ? 'verso' : 'recto');
  assertRectoExtracted(mapped, label);
  return { raw: json, fields };
}

async function mindeeV2Predict(buffer, mime, label, endpoint) {
  const apiKey = process.env.MINDEE_API_KEY;
  const modelId = resolveMindeeModelId();
  if (!modelId) {
    const err = new Error(modelIdHelpMessage());
    err.code = 'MINDEE_MODEL_ID_MISSING';
    throw err;
  }

  console.info('[OCR CIN] provider=mindee');
  console.info('[OCR CIN] endpoint used=' + endpoint);
  console.info('[OCR CIN] model_id=' + modelId.slice(0, 8) + '...');

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('model_id', modelId);
  form.append('file', new Blob([buffer], { type: mime }), `${label}.${ext}`);
  form.append('filename', `${label}.${ext}`);

  const enqueueRes = await fetch(endpoint, {
    method: 'POST',
    headers: mindeeAuthHeader(apiKey),
    body: form,
  });
  const enqueueJson = await enqueueRes.json().catch(() => ({}));
  if (!enqueueRes.ok) {
    const detail = enqueueJson?.detail || enqueueJson?.title || JSON.stringify(enqueueJson);
    throw new Error(`Mindee v2 enqueue ${enqueueRes.status}: ${detail}`);
  }

  const jobId = enqueueJson?.job?.id;
  if (!jobId) throw new Error('Mindee v2: job.id absent dans la reponse.');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(attempt < 5 ? 600 : 900);
    const pollRes = await fetch(`${MINDEE_V2_JOBS_BASE}/${jobId}?redirect=false`, {
      headers: mindeeAuthHeader(apiKey),
    });
    const pollJson = await pollRes.json().catch(() => ({}));
    const status = pollJson?.job?.status;

    if (status === 'Failed') {
      throw new Error(`Mindee v2 job failed (${label})`);
    }

    if (status === 'Processed') {
      const resultUrl = pollJson?.job?.result_url;
      if (!resultUrl) throw new Error('Mindee v2: result_url absent.');

      const resultRes = await fetch(resultUrl, { headers: mindeeAuthHeader(apiKey) });
      const resultJson = await resultRes.json().catch(() => ({}));
      if (!resultRes.ok) {
        throw new Error(`Mindee v2 result ${resultRes.status}: ${resultJson?.detail || 'erreur'}`);
      }

      const fields = extractFieldsFromInference(resultJson);
      if (!fields || !Object.keys(fields).length) {
        throw new Error('Mindee v2: aucun champ extrait.');
      }

      console.info('[OCR CIN] Mindee response OK', { side: label, fieldKeys: Object.keys(fields) });
      const mapped = await logMappedSide(fields, label === 'verso' ? 'verso' : 'recto');
      assertRectoExtracted(mapped, label);
      return { raw: resultJson, fields };
    }
  }

  throw new Error(`Mindee v2 timeout (${label})`);
}

async function mindeePredictRaw(buffer, mime, label) {
  const apiKey = process.env.MINDEE_API_KEY;
  if (!apiKey) {
    const err = new Error('MINDEE_API_KEY manquant');
    err.code = 'OCR_NOT_CONFIGURED';
    throw err;
  }

  const routing = resolveMindeeRouting(apiKey);
  if (routing.version === 'v2') {
    return mindeeV2Predict(buffer, mime, label, routing.endpoint);
  }
  return mindeeV1Predict(buffer, mime, label, routing.endpoint);
}

router.post(
  '/moroccan-cin',
  upload.fields([
    { name: 'recto', maxCount: 1 },
    { name: 'verso', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const rectoFile = req.files?.recto?.[0];
      const versoFile = req.files?.verso?.[0];

      if (!rectoFile && !versoFile) {
        return res.status(400).json({ success: false, error: 'Au moins recto ou verso requis.' });
      }

      const provider = (process.env.OCR_PROVIDER || 'mindee').toLowerCase();

      if (provider === 'mock') {
        console.info('[OCR CIN] provider=mock');
        await logMappedSide(MOCK_RECTO.fields, 'recto');
        if (versoFile) await logMappedSide(MOCK_VERSO.fields, 'verso');
        return res.json({
          success: true,
          provider: 'mock',
          recto: MOCK_RECTO,
          verso: versoFile ? MOCK_VERSO : null,
        });
      }

      if (!process.env.MINDEE_API_KEY) {
        return res.status(503).json({
          success: false,
          code: 'OCR_NOT_CONFIGURED',
          allowFallback: true,
          error: 'Mindee non configure — fallback Tesseract client.',
        });
      }

      let recto = null;
      let verso = null;

      const jobs = [];
      if (rectoFile) {
        jobs.push(
          mindeePredictRaw(rectoFile.buffer, rectoFile.mimetype, 'recto')
            .then((pred) => { recto = { raw: pred.raw, fields: pred.fields }; })
            .catch((err) => { console.warn('[OCR CIN] recto Mindee', err.message); }),
        );
      }
      if (versoFile) {
        jobs.push(
          mindeePredictRaw(versoFile.buffer, versoFile.mimetype, 'verso')
            .then((pred) => { verso = { raw: pred.raw, fields: pred.fields }; })
            .catch((err) => { console.warn('[OCR CIN] verso Mindee', err.message); }),
        );
      }
      await Promise.all(jobs);

      if (!recto && !verso) {
        return res.status(200).json({
          success: false,
          code: 'MINDEE_EMPTY_EXTRACTION',
          allowFallback: true,
          error: 'Mindee: aucune extraction — fallback Tesseract.',
        });
      }

      return res.json({ success: true, provider: 'mindee', recto, verso });
    } catch (err) {
      console.error('[OCR CIN] Erreur Mindee:', err.message);
      const code = err.code || 'OCR_ERROR';
      return res.status(200).json({
        success: false,
        code,
        allowFallback: true,
        error: err.message,
      });
    }
  },
);

router.use((err, _req, res, _next) => {
  const msg = err instanceof multer.MulterError
    ? err.message
    : (err.message || 'Erreur serveur inattendue.');
  return res.status(400).json({ success: false, error: msg });
});

module.exports = router;
