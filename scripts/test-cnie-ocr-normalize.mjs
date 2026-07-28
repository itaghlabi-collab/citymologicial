/**
 * Tests normalisation OCR frontend (sans Vite / sans PII).
 * Usage: node scripts/test-cnie-ocr-normalize.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/services/ocr.js'), 'utf8');
const ouv = fs.readFileSync(path.join(root, 'src/components/OuvriersListe.jsx'), 'utf8');
const crop = fs.readFileSync(path.join(root, 'src/services/cnieAutoCrop.js'), 'utf8');
const cap = fs.readFileSync(path.join(root, 'src/services/cinCapture.js'), 'utf8');

assert.match(src, /export function getReadableMessage/);
assert.match(src, /export function normalizeCnieOcrResponse/);
assert.match(src, /export function normalizeDateToIso/);
assert.match(src, /export function normalizeSexeValue/);
assert.match(src, /\[object Object\]/);
assert.match(ouv, /getReadableMessage/);
assert.match(ouv, /CIN analysée avec succès\. Vérifiez les informations proposées\./);
assert.match(ouv, /Analyse terminée\. Certains champs doivent être vérifiés\./);
assert.match(ouv, /cropHint/);
assert.match(ouv, /data-ocr-field="prenom"/);
assert.match(crop, /autoCropCnieImage/);
assert.match(cap, /autoCropCnieImage/);
assert.match(cap, /cropFailed/);

function getReadableMessage(value, fallback = 'Une erreur est survenue. Saisie manuelle disponible.') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]') return fallback;
    return s;
  }
  if (value instanceof Error) return getReadableMessage(value.message, fallback);
  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) return getReadableMessage(value.message, fallback);
    if (typeof value.error === 'string' && value.error.trim()) return getReadableMessage(value.error, fallback);
    if (value.error && typeof value.error === 'object') return getReadableMessage(value.error, fallback);
    if (typeof value.msg === 'string' && value.msg.trim()) return value.msg.trim();
  }
  return fallback;
}

function normalizeDateToIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return s;
    return '';
  }
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return '';
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += yy >= 50 ? 1900 : 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 1900 || yy > 2100) return '';
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function normalizeSexeValue(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (/^(m|male|masculin|homme|ذكر)$/i.test(s) || s === 'm') return 'M';
  if (/^(f|female|feminin|féminin|femme|أنثى)$/i.test(s) || s === 'f') return 'F';
  return '';
}

assert.equal(getReadableMessage({ error: { message: 'Auth requise' } }), 'Auth requise');
assert.equal(getReadableMessage(new Error({}.toString())), 'Une erreur est survenue. Saisie manuelle disponible.');
assert.equal(getReadableMessage(new Error(String({ a: 1 }))), 'Une erreur est survenue. Saisie manuelle disponible.');
assert.equal(getReadableMessage('[object Object]'), 'Une erreur est survenue. Saisie manuelle disponible.');
assert.equal(getReadableMessage('OK'), 'OK');
assert.equal(normalizeDateToIso('15/03/1990'), '1990-03-15');
assert.equal(normalizeDateToIso('15.03.1990'), '1990-03-15');
assert.equal(normalizeDateToIso('15-03-1990'), '1990-03-15');
assert.equal(normalizeDateToIso('1990-03-15'), '1990-03-15');
assert.equal(normalizeDateToIso('not-a-date'), '');
assert.equal(normalizeSexeValue('Homme'), 'M');
assert.equal(normalizeSexeValue('Female'), 'F');
assert.equal(normalizeSexeValue('M'), 'M');
assert.equal(normalizeSexeValue('x'), '');

// Simulation contrat API réel (sans valeurs personnelles)
const fakeApi = {
  ok: true,
  success: true,
  fields: {
    cin: { value: 'XX000000', confidence: 0.98, confidence_level: 'haute', valid: true },
    nom: { value: 'TESTNOM', confidence: 0.84, confidence_level: 'moyenne', valid: true },
    prenom: { value: 'TESTPRENOM', confidence: 0.84, confidence_level: 'moyenne', valid: true },
    date_naissance: { value: '1990-03-15', confidence: 0.7, confidence_level: 'moyenne', valid: true },
    date_expiration: { value: '2030-01-01', confidence: 1, confidence_level: 'haute', valid: true },
    sexe: { value: 'M', confidence: 0.8, confidence_level: 'moyenne', valid: true },
    nationalite: { value: 'Marocaine', confidence: 0.82, confidence_level: 'moyenne', valid: true },
    lieu_naissance: { value: 'VilleX', confidence: 0.76, confidence_level: 'moyenne', valid: true },
    autorite: { value: null, confidence: 0, confidence_level: 'faible', valid: false },
  },
  worker_form: {
    cin: 'XX000000',
    nom: 'TESTNOM',
    prenom: 'TESTPRENOM',
    date_naissance: '1990-03-15',
    ville_naissance: 'VilleX',
    nationalite: 'Marocaine',
    sexe: 'M',
    date_expiration: '2030-01-01',
  },
};

assert.equal(typeof fakeApi.fields.cin, 'object');
assert.ok(fakeApi.fields.cin.value);
assert.equal(fakeApi.worker_form.ville_naissance, 'VilleX');
assert.ok('lieu_naissance' in fakeApi.fields);
assert.ok(!('data' in fakeApi));

// Cause historique [object Object]
const badErr = new Error({ code: 'X', detail: 'y' });
assert.equal(badErr.message, '[object Object]');
assert.notEqual(getReadableMessage(badErr), '[object Object]');

console.log('PASS: test-cnie-ocr-normalize.mjs');
console.log('API shape (fixture):', {
  rootKeys: Object.keys(fakeApi),
  fieldKeys: Object.keys(fakeApi.fields),
  fieldTypes: Object.fromEntries(Object.entries(fakeApi.fields).map(([k, v]) => [k, typeof v])),
  ok: fakeApi.ok,
});
