/**
 * Sanity route workers CIN — présence fichiers + pas de secret VITE OCR.
 * Usage: node scripts/test-cin-ocr-backend-route.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  'server/routes/workersCin.js',
  'api/workers/cin/analyze.js',
  'src/services/ocr.js',
  'ocr-service/app/main.py',
  'ocr-service/app/services/validators.py',
];
for (const f of files) {
  assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
}

const ocrJs = fs.readFileSync(path.join(root, 'src/services/ocr.js'), 'utf8');
assert.match(ocrJs, /workers\/cin\/analyze/);
assert.doesNotMatch(ocrJs, /OCR_SERVICE_URL/);
assert.doesNotMatch(ocrJs, /OCR_SERVICE_API_KEY/);
assert.match(ocrJs, /isBrowserOcrFallbackEnabled/);
assert.match(ocrJs, /import\.meta\.env\.PROD/);

const workersCin = fs.readFileSync(path.join(root, 'server/routes/workersCin.js'), 'utf8');
assert.match(workersCin, /requireSupabaseAuth/);
assert.match(workersCin, /OCR_SERVICE_API_KEY/);
assert.match(workersCin, /v1\/cin\/analyze-json/);

const mainPy = fs.readFileSync(path.join(root, 'ocr-service/app/main.py'), 'utf8');
assert.match(mainPy, /\/v1\/cin\/analyze/);
assert.match(mainPy, /tesseract.: False/);

console.log('PASS: test-cin-ocr-backend-route.mjs');
