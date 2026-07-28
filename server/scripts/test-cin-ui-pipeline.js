/**
 * Pipeline UI : analyzeCnieGoogle → contrat workersCin → champs formulaire.
 * Aucune valeur PII affichée. Aucun chemin utilisateur hardcodé.
 *
 * Usage:
 *   CNIE_TEST_IMAGES_DIR=/chemin/vers/images \
 *   node server/scripts/test-cin-ui-pipeline.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeCnieGoogle } = require('../services/cnieGoogleAnalyze');
const googleVision = require('../services/googleVision');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_DIR = path.join(ROOT, 'ocr-service/test-data/cnie-real');
const IMAGES_DIR = process.env.CNIE_TEST_IMAGES_DIR
  ? path.resolve(process.env.CNIE_TEST_IMAGES_DIR)
  : DEFAULT_DIR;

function resolvePair(i) {
  const candidates = [
    [`carte${i}-recto.jpg`, `carte${i}-verso.jpg`],
    [`carte${i}-recto.jpeg`, `carte${i}-verso.jpeg`],
    [`carte${i}_recto.jpeg`, `carte${i}_verso.jpeg`],
  ];
  for (const [r, v] of candidates) {
    const recto = path.join(IMAGES_DIR, r);
    const verso = path.join(IMAGES_DIR, v);
    if (fs.existsSync(recto) && fs.existsSync(verso)) return { recto, verso };
  }
  return null;
}

function mapResponse(data) {
  if (!data || data.ok === false) {
    return { ok: false, error_code: data?.error_code, engine_used: data?.engine_used };
  }
  const fields = data.fields || {};
  const wf = data.worker_form || {};
  return {
    ok: true,
    fields,
    worker_form: wf,
    confidence_globale: data.confidence_globale,
    engine_used: data.engine_used,
    duration_ms: data.duration_ms,
    faces_swapped: !!data.faces_swapped,
  };
}

function fieldUsable(f) {
  if (!f || f.valid === false) return false;
  if (f.value == null || String(f.value).trim() === '') return false;
  const conf = Number(f.confidence);
  if (Number.isFinite(conf) && conf < 0.7) return false;
  return true;
}

/** Miroir de pickFillableFields (ocr.js) — statut filled/empty uniquement */
function pickFillable(json) {
  const fields = json.fields || {};
  const wf = json.worker_form || {};
  const mapping = [
    ['cin', 'cin', 'numero_cin'],
    ['prenom', 'prenom', 'prenom'],
    ['nom', 'nom', 'nom'],
    ['date_naissance', 'date_naissance', 'date_naissance'],
    ['ville_naissance', 'ville_naissance', 'lieu_naissance'],
    ['nationalite', 'nationalite', 'nationalite'],
    ['sexe', 'sexe', 'sexe'],
    ['date_expiration', 'date_expiration', 'date_expiration'],
    ['adresse', 'adresse', 'adresse'],
    ['autorite', 'autorite', 'autorite'],
  ];
  const out = {};
  for (const [formKey, wfKey, fieldKey] of mapping) {
    const f = fields[fieldKey] || fields[wfKey];
    let value = null;
    if (fieldUsable(f)) value = true;
    else if (wf[wfKey] != null && String(wf[wfKey]).trim() !== '') value = true;
    out[formKey] = value ? 'filled' : 'empty';
  }
  return out;
}

async function runCard(i) {
  const pair = resolvePair(i);
  if (!pair) return { carte: i, missing_images: true };
  const front = fs.readFileSync(pair.recto);
  const back = fs.readFileSync(pair.verso);
  const raw = await analyzeCnieGoogle({ front, back, force: true });
  const mapped = mapResponse(raw);
  const form = pickFillable(mapped);
  const expected = ['cin', 'nom', 'prenom', 'date_naissance', 'sexe', 'nationalite', 'ville_naissance', 'date_expiration'];
  const missing = expected.filter((k) => form[k] === 'empty');
  return {
    carte: i,
    vision_real: raw.engine_used === 'google_vision' && raw.ok === true,
    endpoint_contract: mapped.ok === true,
    ms: raw.duration_ms,
    form,
    missing_required: missing,
    autorite: form.autorite,
    adresse: form.adresse,
    confidence_globale: mapped.confidence_globale,
  };
}

async function main() {
  console.log('vision_available', googleVision.visionAvailable());
  console.log('credentials', googleVision.credentialsPath() ? path.basename(googleVision.credentialsPath()) : null);
  console.log('images_dir', IMAGES_DIR);
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('FAIL: définissez CNIE_TEST_IMAGES_DIR ou placez les images dans ocr-service/test-data/cnie-real');
    process.exit(2);
  }
  for (const i of [1, 2, 3]) {
    const r = await runCard(i);
    console.log(JSON.stringify(r));
  }
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
