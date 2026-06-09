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

const MINDEE_MODEL_ID_ERROR = 'MINDEE_MODEL_ID manquant. Clé md_* (API v2) : ajoutez MINDEE_MODEL_ID dans Vercel (UUID du modèle International ID). Alternative : clé re_* (API v1, sans MODEL_ID).';

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

/** Modèle International ID Citymo — secours si variable Vercel absente (UUID public dashboard Mindee). */
const CITYMO_DEFAULT_MINDEE_MODEL_ID = 'a74f083a-cbad-406c-a13e-a8446fa74eb7';

function resolveMindeeModelId() {
  const direct = (process.env.MINDEE_MODEL_ID || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(direct)) return direct;
  const fromUrl = (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').trim();
  const match = fromUrl.match(/\/models\/([0-9a-f-]{36})/i);
  if (match) return match[1];
  return CITYMO_DEFAULT_MINDEE_MODEL_ID;
}

/** Infos routage (sans exposer la clé). */
function hasExplicitMindeeModelId() {
  const direct = (process.env.MINDEE_MODEL_ID || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(direct)) return true;
  const fromUrl = (process.env.MINDEE_MODEL_URL || process.env.MINDEE_LIVE_TEST_URL || '').trim();
  return Boolean(fromUrl.match(/\/models\/([0-9a-f-]{36})/i));
}

export function getMindeeRoutingInfo(apiKey = process.env.MINDEE_API_KEY) {
  const key = apiKey || '';
  const v2 = isMindeeV2Key(key);
  const modelId = resolveMindeeModelId();
  const explicitModelId = hasExplicitMindeeModelId();
  const useV2 = Boolean(v2 && key && modelId);
  return {
    OCR_PROVIDER: (process.env.OCR_PROVIDER || 'mindee').toLowerCase(),
    key_type: !key ? 'missing' : (v2 ? 'md_v2' : 'legacy_v1'),
    has_MINDEE_MODEL_ID: explicitModelId || Boolean(modelId),
    model_id_source: explicitModelId ? 'env' : (modelId ? 'default_citymo' : 'none'),
    api_version: useV2 ? 'v2' : 'v1',
    endpoint: useV2 ? MINDEE_V2_ENQUEUE : MINDEE_V1,
    product: useV2 ? 'custom_extraction_v2' : 'international_id/v2',
    mindee_api_key: key ? 'present' : 'missing',
    mindee_model_id: explicitModelId ? 'present' : (modelId ? 'default' : (v2 ? 'v1_fallback' : 'not_required_v1')),
    model_id_required: false,
  };
}

function logMindeeServerConfig() {
  const info = getMindeeRoutingInfo();
  console.info('[OCR CIN] Mindee config serveur', info);
  if (info.key_type === 'md_v2' && info.model_id_source === 'default_citymo') {
    console.warn('[OCR CIN] MINDEE_MODEL_ID absent sur Vercel — utilisation du modèle International ID Citymo par défaut');
  }
  if (info.key_type === 'md_v2' && !info.has_MINDEE_MODEL_ID) {
    console.warn('[OCR CIN] clé md_* sans model_id — fallback International ID v1');
  }
}

function logMindeeRawResponse(label, pred, endpoint) {
  const keys = pred?.fields && typeof pred.fields === 'object' ? Object.keys(pred.fields) : [];
  let rawPreview = '';
  try {
    rawPreview = JSON.stringify(pred?.raw ?? pred?.fields ?? {}).slice(0, 2000);
  } catch (_) {
    rawPreview = '(non sérialisable)';
  }
  console.info(`[OCR CIN] Mindee réponse brute (${label})`, {
    endpoint,
    field_keys: keys,
    raw_preview: rawPreview,
  });
}

function buildDiagnostics({ rectoBuf, versoBuf, sideErrors = [], extra = {} }) {
  return {
    ...getMindeeRoutingInfo(),
    recto_bytes: rectoBuf?.length || 0,
    verso_bytes: versoBuf?.length || 0,
    side_errors: sideErrors,
    ...extra,
  };
}

function validateMindeeConfig() {
  const apiKey = process.env.MINDEE_API_KEY;
  if (!apiKey) {
    return { ok: false, code: 'OCR_NOT_CONFIGURED', error: 'MINDEE_API_KEY manquant sur le serveur (Vercel → Environment Variables).' };
  }
  return { ok: true };
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
  console.info('[OCR CIN] AVANT appel Mindee v1', {
    label,
    endpoint,
    method: 'POST',
    content_type: 'multipart/form-data',
    image_bytes: buffer?.length || 0,
    mime,
    auth: isMindeeV2Key(apiKey) ? 'md_* direct' : 'Token re_*',
  });
  console.info('[OCR CIN] Mindee v1 HTTP POST', endpoint, `(${label})`);
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
  console.info('[OCR CIN] APRÈS appel Mindee v1', {
    label,
    http_status: res.status,
    ok: res.ok,
    body_preview: text.slice(0, 500),
  });
  if (!res.ok) {
    const detail = json?.api_request?.error?.message || json?.message || text.slice(0, 400);
    const err = new Error(`Mindee v1 erreur ${res.status}: ${detail}`);
    err.code = 'MINDEE_V1_HTTP';
    err.status = res.status;
    err.body = text.slice(0, 800);
    err.endpoint = endpoint;
    throw err;
  }
  const fields = extractFieldsFromInference(json);
  if (!fields || !Object.keys(fields).length) throw new Error('Mindee v1: aucun champ extrait.');
  return { raw: json, fields, endpoint };
}

async function mindeeV2Predict(buffer, mime, label, apiKey) {
  const modelId = resolveMindeeModelId();
  if (!modelId) {
    console.warn(`[OCR CIN] ${label} — clé md_* sans MINDEE_MODEL_ID, fallback International ID v1`);
    return mindeeV1Predict(buffer, mime, label, MINDEE_V1, apiKey);
  }
  console.info('[OCR CIN] AVANT appel Mindee v2', {
    label,
    endpoint: MINDEE_V2_ENQUEUE,
    method: 'POST',
    model_id: modelId,
    image_bytes: buffer?.length || 0,
    mime,
  });
  console.info('[OCR CIN] Mindee v2 HTTP POST', MINDEE_V2_ENQUEUE, `model_id=${modelId}`, `(${label})`);
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
  console.info('[OCR CIN] APRÈS enqueue Mindee v2', {
    label,
    http_status: enqueueRes.status,
    ok: enqueueRes.ok,
    job_id: enqueueJson?.job?.id || null,
  });
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
      return { raw: resultJson, fields, endpoint: MINDEE_V2_ENQUEUE };
    }
  }
  throw new Error(`Mindee v2 timeout (${label})`);
}

export async function mindeePredictBuffer(buffer, mime, label, auditState) {
  const apiKey = process.env.MINDEE_API_KEY;
  if (!apiKey) {
    const err = new Error('MINDEE_API_KEY manquant');
    err.code = 'OCR_NOT_CONFIGURED';
    throw err;
  }
  if (auditState) auditState.mindee_http_called = true;
  if (isMindeeV2Key(apiKey)) {
    const modelId = resolveMindeeModelId();
    if (!modelId) {
      console.warn(`[OCR CIN] ${label} — clé md_* sans model_id, fallback International ID v1`);
      return mindeeV1Predict(buffer, mime, label, MINDEE_V1, apiKey);
    }
    if (!hasExplicitMindeeModelId()) {
      console.info(`[OCR CIN] ${label} — model_id Citymo par défaut (ajoutez MINDEE_MODEL_ID sur Vercel pour override)`);
    }
    return mindeeV2Predict(buffer, mime, label, apiKey);
  }
  return mindeeV1Predict(buffer, mime, label, MINDEE_V1, apiKey);
}

export async function processMoroccanCinBuffers({ rectoBuf, versoBuf }) {
  const provider = (process.env.OCR_PROVIDER || 'mindee').toLowerCase();
  logMindeeServerConfig();

  if (provider === 'mock') {
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
    return {
      success: true,
      provider: 'mock',
      provider_final: 'mock',
      recto: MOCK_RECTO,
      verso: versoBuf ? MOCK_VERSO : null,
      mindee_recto_ok: true,
      mindee_verso_ok: Boolean(versoBuf),
      diagnostics: buildDiagnostics({ rectoBuf, versoBuf }),
    };
  }

  const configCheck = validateMindeeConfig();
  if (!configCheck.ok) {
    const diag = buildDiagnostics({ rectoBuf, versoBuf, mindee_http_called: false });
    return {
      success: false,
      code: configCheck.code,
      allowFallback: true,
      error: configCheck.error + ' Mindee non utilisé — fallback Tesseract.',
      provider_final: 'tesseract',
      mindee_http_called: false,
      mindee_config_blocked: true,
      config_error: configCheck.error,
      diagnostics: diag,
      audit: {
        mindee_http_called: false,
        mindee_config_blocked: true,
        config_error: configCheck.error,
        vercel_runtime: diag,
      },
    };
  }

  if (provider !== 'mindee' && provider !== 'mock') {
    return {
      success: false,
      code: 'OCR_PROVIDER_DISABLED',
      allowFallback: true,
      error: `OCR_PROVIDER=${provider} — seul "mindee" est supporté. Mindee non utilisé — fallback Tesseract.`,
      provider_final: 'tesseract',
    };
  }

  const routing = getMindeeRoutingInfo();
  let recto = null;
  let verso = null;
  const sideErrors = [];
  const jobs = [];
  const auditState = { mindee_http_called: false };

  if (rectoBuf?.length) {
    jobs.push(
      mindeePredictBuffer(rectoBuf, bufferMime(rectoBuf), 'recto', auditState)
        .then((pred) => {
          recto = { raw: pred.raw, fields: pred.fields };
          logMindeeRawResponse('recto', pred, pred.endpoint || routing.endpoint);
        })
        .catch((err) => {
          const msg = formatMindeeSideError('recto', err);
          sideErrors.push(msg);
          console.warn('[OCR CIN] recto Mindee échec', msg);
        }),
    );
  }
  if (versoBuf?.length) {
    jobs.push(
      mindeePredictBuffer(versoBuf, bufferMime(versoBuf), 'verso', auditState)
        .then((pred) => {
          verso = { raw: pred.raw, fields: pred.fields };
          logMindeeRawResponse('verso', pred, pred.endpoint || routing.endpoint);
        })
        .catch((err) => {
          const msg = formatMindeeSideError('verso', err);
          sideErrors.push(msg);
          console.warn('[OCR CIN] verso Mindee échec', msg);
        }),
    );
  }
  await Promise.all(jobs);

  const mindeeRectoOk = Boolean(recto?.fields && Object.keys(recto.fields).length);
  const mindeeVersoOk = !versoBuf?.length || Boolean(verso?.fields && Object.keys(verso.fields).length);
  const diagnostics = buildDiagnostics({
    rectoBuf,
    versoBuf,
    sideErrors,
    mindee_recto_ok: mindeeRectoOk,
    mindee_verso_ok: mindeeVersoOk,
    endpoint_used: routing.endpoint,
    mindee_http_called: auditState.mindee_http_called,
  });

  if (!mindeeRectoOk && !mindeeVersoOk) {
    const detail = sideErrors.length ? sideErrors.join(' | ') : 'Mindee: aucune extraction.';
    console.error('[OCR CIN] provider_final=tesseract —', detail);
    return {
      success: false,
      code: sideErrors.some((e) => e.includes('MINDEE_MODEL_ID')) ? 'MINDEE_MODEL_ID_MISSING' : 'MINDEE_EMPTY_EXTRACTION',
      allowFallback: true,
      error: detail + ' Mindee non utilisé — fallback Tesseract.',
      provider_final: 'tesseract',
      mindee_http_called: auditState.mindee_http_called,
      diagnostics,
      audit: {
        mindee_http_called: auditState.mindee_http_called,
        provider_final: 'tesseract',
        side_errors: sideErrors,
        vercel_runtime: diagnostics,
      },
    };
  }

  const providerFinal = mindeeRectoOk && mindeeVersoOk ? 'mindee' : 'mindee_partial';
  console.info('[OCR CIN] provider_final=' + providerFinal, {
    recto: mindeeRectoOk,
    verso: mindeeVersoOk,
    endpoint: routing.endpoint,
    api_version: routing.api_version,
  });
  if (providerFinal !== 'mindee') {
    console.warn('[OCR CIN] Mindee partiel — extraction identité/adresse peut utiliser Tesseract en complément');
  }

  return {
    success: true,
    provider: 'mindee',
    provider_final: providerFinal,
    recto,
    verso,
    mindee_recto_ok: mindeeRectoOk,
    mindee_verso_ok: mindeeVersoOk,
    mindee_http_called: auditState.mindee_http_called,
    diagnostics,
    audit: {
      mindee_http_called: auditState.mindee_http_called,
      provider_final: providerFinal,
      mindee_recto_ok: mindeeRectoOk,
      mindee_verso_ok: mindeeVersoOk,
      vercel_runtime: diagnostics,
    },
  };
}

function formatMindeeSideError(side, err) {
  const parts = [side];
  if (err?.code) parts.push(String(err.code));
  if (err?.status) parts.push(`HTTP ${err.status}`);
  if (err?.message) parts.push(String(err.message));
  if (err?.endpoint) parts.push(`endpoint=${err.endpoint}`);
  if (err?.body) parts.push(`body=${String(err.body).slice(0, 200)}`);
  return parts.join(' — ');
}
