/**
 * CITYMO ERP – OCR Route
 * POST /api/ocr/moroccan-cin
 *
 * Accepts multipart/form-data:
 *   recto  — image file (required)
 *   verso  — image file (optional, sent but not analysed by Mindee)
 *
 * Provider: Mindee International ID v2
 *   Endpoint: POST https://api.mindee.net/v1/products/mindee/international_id/v2/predict
 *   Env var:  MINDEE_API_KEY
 *
 * Fallback: OCR_PROVIDER=mock  →  returns synthetic data (dev / demo)
 *
 * Response contract:
 * {
 *   "success": true,
 *   "data": {
 *     "cin":            "",   // document_number.value
 *     "prenom":         "",   // given_names[0].value
 *     "nom":            "",   // surnames[0].value
 *     "date_naissance": "",   // date_of_birth.value  (YYYY-MM-DD)
 *     "ville_naissance":"",   // place_of_birth.value
 *     "sexe":           "",   // sex.value  ("M" | "F")
 *     "nationalite":    ""    // nationality.value
 *   }
 * }
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const https   = require('https');
const { URL } = require('url');

const router = express.Router();

// ── Multer — memory storage ───────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 },   // 15 MB max per file
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Seules les images sont acceptees (jpeg, png, webp).'));
    }
    cb(null, true);
  },
});

// ── Mindee International ID v2 ────────────────────────────────────────────────
//
// Official product slug: mindee/international_id  version: v2
// Docs: https://developers.mindee.com/docs/international-id-ocr
//
const MINDEE_ENDPOINT =
  'https://api.mindee.net/v1/products/mindee/international_id/v2/predict';

/**
 * Call Mindee International ID API and return normalised CIN fields.
 *
 * @param {Buffer} buffer    — raw image bytes
 * @param {string} mime      — e.g. "image/jpeg"
 * @returns {Promise<object>}
 */
async function mindeeOcr(buffer, mime) {
  const apiKey = process.env.MINDEE_API_KEY;
  if (!apiKey) {
    throw new Error('MINDEE_API_KEY manquant dans .env — configurez la cle API Mindee.');
  }

  // ── Build multipart body manually (no external dep needed) ──
  const boundary = `----CitymoBoundary${Date.now()}`;
  const ext      = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const filename = `cin_recto.${ext}`;

  const partHead = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${filename}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  );
  const partTail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body     = Buffer.concat([partHead, buffer, partTail]);

  const parsed = new URL(MINDEE_ENDPOINT);
  const rawResponse = await new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request(
      {
        method:   'POST',
        hostname: parsed.hostname,
        path:     parsed.pathname + (parsed.search || ''),
        headers:  {
          Authorization:  `Token ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      res => {
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, text });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  // ── Parse response ──
  let json;
  try {
    json = JSON.parse(rawResponse.text);
  } catch {
    throw new Error(`Mindee: reponse non-JSON (HTTP ${rawResponse.status})`);
  }

  if (rawResponse.status !== 201 && rawResponse.status !== 200) {
    const detail = json?.api_request?.error?.message || json?.message || rawResponse.text;
    throw new Error(`Mindee erreur ${rawResponse.status}: ${detail}`);
  }

  // ── Navigate to prediction object ──
  // Shape: json.document.inference.prediction
  const pred = json?.document?.inference?.prediction || {};

  // ── Field extractors ──
  function str(field) {
    if (!field) return '';
    // Some fields are objects with .value, others are arrays
    if (typeof field === 'string') return field.trim();
    if (Array.isArray(field)) {
      // e.g. given_names / surnames are arrays of {value, confidence}
      return (field[0]?.value || '').trim();
    }
    return (field.value || '').trim();
  }

  // given_names and surnames are arrays — join all values for full name
  function strArray(field) {
    if (!field || !Array.isArray(field)) return str(field);
    return field.map(f => (f?.value || '').trim()).filter(Boolean).join(' ');
  }

  // date_of_birth may be "YYYY-MM-DD" or "DD/MM/YYYY" or a Date object string
  function normDate(field) {
    const raw = str(field);
    if (!raw) return '';
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // DD/MM/YYYY
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // YYYY/MM/DD
    const m2 = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return raw;
  }

  // sex: normalise to "M" or "F"
  function normSex(field) {
    const v = str(field).toUpperCase();
    if (v === 'M' || v === 'MALE'   || v === 'MASCULIN') return 'M';
    if (v === 'F' || v === 'FEMALE' || v === 'FEMININ')  return 'F';
    return v.charAt(0) || '';
  }

  return {
    cin:            str(pred.document_number),
    prenom:         strArray(pred.given_names),
    nom:            strArray(pred.surnames),
    date_naissance: normDate(pred.date_of_birth),
    ville_naissance:str(pred.place_of_birth),
    sexe:           normSex(pred.sex),
    nationalite:    str(pred.nationality),
  };
}

// ── Mock provider (dev / demo) ────────────────────────────────────────────────
function mockOcr() {
  return {
    cin:            'BE456789',
    prenom:         'Yassine',
    nom:            'BENALI',
    date_naissance: '1995-08-22',
    ville_naissance:'Rabat',
    sexe:           'M',
    nationalite:    'MAR',
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
router.post(
  '/moroccan-cin',
  upload.fields([
    { name: 'recto', maxCount: 1 },
    { name: 'verso', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const rectoFile = req.files?.recto?.[0];
      if (!rectoFile) {
        return res.status(400).json({
          success: false,
          error:   "L'image recto est obligatoire.",
        });
      }

      const provider = (process.env.OCR_PROVIDER || 'mindee').toLowerCase();

      let data;
      if (provider === 'mock') {
        data = mockOcr();
      } else {
        // Default: real Mindee International ID
        data = await mindeeOcr(rectoFile.buffer, rectoFile.mimetype);
      }

      return res.json({
        success: true,
        data: {
          cin:            data.cin            || '',
          prenom:         data.prenom         || '',
          nom:            data.nom            || '',
          date_naissance: data.date_naissance || '',
          ville_naissance:data.ville_naissance|| '',
          sexe:           data.sexe           || '',
          nationalite:    data.nationalite    || '',
        },
      });

    } catch (err) {
      console.error('[OCR] Erreur:', err.message);
      return res.status(500).json({
        success: false,
        error:   `Erreur OCR: ${err.message}`,
      });
    }
  }
);

// ── Multer error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  const msg = err instanceof multer.MulterError
    ? err.message
    : (err.message || 'Erreur serveur inattendue.');
  return res.status(400).json({ success: false, error: msg });
});

module.exports = router;
