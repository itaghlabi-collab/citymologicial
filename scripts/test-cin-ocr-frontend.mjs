/**
 * Tests helpers OCR frontend (conflits) — sans import Vite.
 * Usage: node scripts/test-cin-ocr-frontend.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/services/ocr.js'), 'utf8');

assert.match(src, /workers\/cin\/analyze/);
assert.match(src, /import\.meta\.env\.PROD/);
assert.match(src, /isBrowserOcrFallbackEnabled/);
assert.match(src, /isRealFieldConflict/);
assert.match(src, /FILL_MIN_CONFIDENCE = 0\.70/);
assert.doesNotMatch(src, /OCR_SERVICE_URL/);
assert.doesNotMatch(src, /moroccan-cin/);

function normalizeConflictValue(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

const DEFAULT_FORM_VALUES = { nationalite: 'marocaine' };
const FILL_MIN = 0.7;

function isRealFieldConflict(formKey, current, detected, fieldMeta) {
  const cur = String(current || '').trim();
  const det = String(detected || '').trim();
  if (!cur || !det) return false;
  if (det.length <= 1) return false;
  const conf = Number(fieldMeta?.[formKey]?.confidence);
  if (Number.isFinite(conf) && conf < FILL_MIN) return false;
  if (normalizeConflictValue(cur) === normalizeConflictValue(det)) return false;
  const def = DEFAULT_FORM_VALUES[formKey];
  if (def && normalizeConflictValue(cur) === def) return false;
  return true;
}

assert.equal(isRealFieldConflict('nationalite', 'Marocaine', 'À', { nationalite: { confidence: 0.95 } }), false);
assert.equal(isRealFieldConflict('nationalite', '', 'Marocaine', { nationalite: { confidence: 0.95 } }), false);
assert.equal(isRealFieldConflict('nom', 'ALAOUI', 'BENALI', { nom: { confidence: 0.95 } }), true);
assert.equal(isRealFieldConflict('nom', 'ALAOUI', 'BENALI', { nom: { confidence: 0.5 } }), false);
assert.equal(isRealFieldConflict('nationalite', 'Marocaine', 'Française', { nationalite: { confidence: 0.95 } }), false);

const ouv = fs.readFileSync(path.join(root, 'src/components/OuvriersListe.jsx'), 'utf8');
assert.match(ouv, /isRealFieldConflict/);
assert.match(ouv, /Object\.keys\(fieldConflicts\.conflicts\)\.length >= 2/);
assert.match(ouv, /getReadableMessage/);
assert.match(ouv, /fillFormFromOcr/);
assert.match(ouv, /CIN analysée avec succès/);

console.log('PASS: test-cin-ocr-frontend.mjs');
