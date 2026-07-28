/**
 * Test d’intégration Google Vision (réel) — images via CNIE_TEST_IMAGES_DIR.
 *
 * Usage:
 *   CNIE_TEST_IMAGES_DIR=/chemin/vers/images \
 *   GOOGLE_APPLICATION_CREDENTIALS=/chemin/key.json \
 *   node server/scripts/test-google-vision-cnie.js
 *
 * Attend des fichiers : carte1-recto.jpg, carte1-verso.jpg, … (ou .jpeg).
 * N’affiche jamais les valeurs personnelles (CIN, noms, dates).
 * Aucun chemin utilisateur hardcodé.
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

function statusField(f) {
  if (!f || !f.value) return 'miss';
  return f.valid ? 'ok' : 'weak';
}

async function main() {
  console.log('credentials=', googleVision.credentialsPath() ? path.basename(googleVision.credentialsPath()) : 'NONE');
  console.log('available=', googleVision.visionAvailable());
  console.log('images_dir=', IMAGES_DIR);
  if (!googleVision.visionAvailable()) {
    console.error('FAIL: configurez GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(2);
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('FAIL: CNIE_TEST_IMAGES_DIR introuvable (ou ocr-service/test-data/cnie-real)');
    process.exit(2);
  }

  for (let i = 1; i <= 3; i += 1) {
    const pair = resolvePair(i);
    if (!pair) {
      console.log(`carte${i}: MISSING_IMAGES`);
      continue;
    }
    const front = fs.readFileSync(pair.recto);
    const back = fs.readFileSync(pair.verso);
    const out = await analyzeCnieGoogle({ front, back, force: true });
    console.log(`carte${i}:`, {
      ok: out.ok,
      engine: out.engine_used,
      ms: out.duration_ms,
      cin: statusField(out.fields?.cin),
      nom: statusField(out.fields?.nom),
      prenom: statusField(out.fields?.prenom),
      date_naissance: statusField(out.fields?.date_naissance),
      date_expiration: statusField(out.fields?.date_expiration),
      sexe: statusField(out.fields?.sexe),
      lieu: statusField(out.fields?.lieu_naissance),
      nationalite: statusField(out.fields?.nationalite),
      autorite: statusField(out.fields?.autorite),
    });
  }
}

main().catch((err) => {
  console.error('FATAL', err.code || err.message);
  process.exit(1);
});
