/**
 * Logique Mindee CIN — partagée Express (server/) et Vercel (api/).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MINDEE_V1 = process.env.MINDEE_ENDPOINT
  || 'https://api.mindee.net/v1/products/mindee/international_id/v2/predict';
const MINDEE_V2_ENQUEUE = 'https://api-v2.mindee.net/v2/products/extraction/enqueue';
const MINDEE_V2_JOBS = 'https://api-v2.mindee.net/v2/jobs';

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

function resolveMindeeModelId() {
  const direct = (process.env.MINDEE_MODEL_ID || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(direct)) return direct;
  const fromUrl = (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').trim();
  const match = fromUrl.match(/\/models\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

function extractFieldsFromInference(json) {
  if (!json || typeof json !== 'object') return null;
  const candidates = [
    json?.inference?.result?.fields,
    json?.document?.inference?.result?.fields,
    json?.document?.inference?.prediction,
    json?.inference?.prediction,
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

export function dataUrlToBuffer(dataUrl) {
  const raw = String(dataUrl || '');
  const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
  return Buffer.from(base64, 'base64');
}

export function bufferMime(buf, fallback = 'image/jpeg') {
  if (!buf || buf.length < 4) return fallback;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  return fallback;
}

async function getCinOcrModule() {
  const cinPath = path.join(__dirname, '../src/services/cinOcr.js');
  return import(pathToFileURL(cinPath));
}

async function mindeeV1Predict(buffer, mime, label, endpoint, apiKey) {
  const boundary = `----CitymoBoundary${Date.now()}`;
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const partHead = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${label}.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const partTail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([partHead, buffer, partTail]);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...mindeeAuthHeader(apiKey),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const detail = json?.api_request?.error?.message || json?.message || text.slice(0, 200);
    throw new Error(`Mindee v1 erreur ${res.status}: ${detail}`);
  }
  const fields = extractFieldsFromInference(json);
  if (!fields || !Object.keys(fields).length) throw new Error('Mindee v1: aucun champ extrait.');
  return { raw: json, fields };
}

async function mindeeV2Predict(buffer, mime, label, apiKey) {
  const modelId = resolveMindeeModelId();
  if (!modelId) {
    const err = new Error('MINDEE_MODEL_ID requis pour clé md_* (API v2).');
    err.code = 'MINDEE_MODEL_ID_MISSING';
    throw err;
  }
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const form = new FormData();
  form.append('model_id', modelId);
  form.append('file', new Blob([buffer], { type: mime }), `${label}.${ext}`);
  form.append('filename', `${label}.${ext}`);

  const enqueueRes = await fetch(MINDEE_V2_ENQUEUE, {
    method: 'POST',
    headers: mindeeAuthHeader(apiKey),
    body: form,
  });
  const enqueueJson = await enqueueRes.json().catch(() => ({}));
  if (!enqueueRes.ok) {
    throw new Error(`Mindee v2 enqueue ${enqueueRes.status}: ${enqueueJson?.detail || enqueueJson?.title || 'erreur'}`);
  }
  const jobId = enqueueJson?.job?.id;
  if (!jobId) throw new Error('Mindee v2: job.id absent.');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(attempt < 5 ? 600 : 900);
    const pollRes = await fetch(`${MINDEE_V2_JOBS}/${jobId}?redirect=false`, {
      headers: mindeeAuthHeader(apiKey),
    });
    const pollJson = await pollRes.json().catch(() => ({}));
    const status = pollJson?.job?.status;
    if (status === 'Failed') throw new Error(`Mindee v2 job failed (${label})`);
    if (status === 'Processed') {
      const resultUrl = pollJson?.job?.result_url;
      if (!resultUrl) throw new Error('Mindee v2: result_url absent.');
      const resultRes = await fetch(resultUrl, { headers: mindeeAuthHeader(apiKey) });
      const resultJson = await resultRes.json().catch(() => ({}));
      if (!resultRes.ok) throw new Error(`Mindee v2 result ${resultRes.status}`);
      const fields = extractFieldsFromInference(resultJson);
      if (!fields || !Object.keys(fields).length) throw new Error('Mindee v2: aucun champ extrait.');
      return { raw: resultJson, fields };
    }
  }
  throw new Error(`Mindee v2 timeout (${label})`);
}

export async function mindeePredictBuffer(buffer, mime, label) {
  const apiKey = process.env.MINDEE_API_KEY;
  if (!apiKey) {
    const err = new Error('MINDEE_API_KEY manquant');
    err.code = 'OCR_NOT_CONFIGURED';
    throw err;
  }
  if (isMindeeV2Key(apiKey)) {
    return mindeeV2Predict(buffer, mime, label, apiKey);
  }
  return mindeeV1Predict(buffer, mime, label, MINDEE_V1, apiKey);
}

export async function processMoroccanCinBuffers({ rectoBuf, versoBuf }) {
  const provider = (process.env.OCR_PROVIDER || 'mindee').toLowerCase();
  if (provider === 'mock') {
    const { mapMindeeFields } = await getCinOcrModule();
    const MOCK_RECTO = {
      fields: {
        surnames: [{ value: 'ELOUADOUD' }],
        given_names: [{ value: 'JIHANE' }],
        document_number: { value: 'BA21889' },
        date_of_birth: { value: '2003-03-26' },
        date_of_expiry: { value: '2029-11-25' },
        sex: { value: 'F' },
        nationality: { value: 'MAROC' },
      },
    };
    const MOCK_VERSO = {
      fields: {
        address: { fields: { street: { value: '14 BLOC 28 SIDI OTHMANE' }, city: { value: 'CASABLANCA' } } },
      },
    };
    return { success: true, provider: 'mock', recto: MOCK_RECTO, verso: versoBuf ? MOCK_VERSO : null };
  }

  if (!process.env.MINDEE_API_KEY) {
    return {
      success: false,
      code: 'OCR_NOT_CONFIGURED',
      allowFallback: true,
      error: 'Mindee non configure — fallback Tesseract client.',
    };
  }

  let recto = null;
  let verso = null;
  const jobs = [];
  if (rectoBuf?.length) {
    jobs.push(
      mindeePredictBuffer(rectoBuf, bufferMime(rectoBuf), 'recto')
        .then((pred) => { recto = { raw: pred.raw, fields: pred.fields }; })
        .catch((err) => { console.warn('[OCR CIN] recto Mindee', err.message); }),
    );
  }
  if (versoBuf?.length) {
    jobs.push(
      mindeePredictBuffer(versoBuf, bufferMime(versoBuf), 'verso')
        .then((pred) => { verso = { raw: pred.raw, fields: pred.fields }; })
        .catch((err) => { console.warn('[OCR CIN] verso Mindee', err.message); }),
    );
  }
  await Promise.all(jobs);

  if (!recto && !verso) {
    return {
      success: false,
      code: 'MINDEE_EMPTY_EXTRACTION',
      allowFallback: true,
      error: 'Mindee: aucune extraction — fallback Tesseract.',
    };
  }
  return { success: true, provider: 'mindee', recto, verso };
}
