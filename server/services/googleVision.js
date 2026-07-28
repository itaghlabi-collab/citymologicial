/**
 * Google Cloud Vision — moteur isolé (DOCUMENT_TEXT_DETECTION).
 * Aucune logique métier ouvrier / CNIE ici.
 *
 * Auth serveur uniquement via :
 *   GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/service-account.json
 * ou
 *   GOOGLE_VISION_KEY_FILE=/chemin/vers/service-account.json
 *
 * Ne jamais logger le contenu des credentials ni le texte OCR complet (PII).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vision = require('@google-cloud/vision');

let _client = null;
let _initError = null;

function credentialsPath() {
  const p = (
    process.env.GOOGLE_VISION_KEY_FILE
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || ''
  ).trim();
  return p || null;
}

function visionAvailable() {
  const p = credentialsPath();
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function getClient() {
  if (_client) return _client;
  const keyFile = credentialsPath();
  if (!keyFile) {
    _initError = 'GOOGLE_CREDENTIALS_MISSING';
    const err = new Error('Credentials Google Vision absents');
    err.code = 'GOOGLE_CREDENTIALS_MISSING';
    throw err;
  }
  if (!fs.existsSync(keyFile)) {
    _initError = 'GOOGLE_CREDENTIALS_NOT_FOUND';
    const err = new Error('Fichier credentials Google Vision introuvable');
    err.code = 'GOOGLE_CREDENTIALS_NOT_FOUND';
    throw err;
  }
  // Log non sensible uniquement
  console.info('[googleVision] init', {
    keyFileName: path.basename(keyFile),
    keyDir: path.dirname(keyFile),
  });
  _client = new vision.ImageAnnotatorClient({ keyFilename: keyFile });
  _initError = null;
  return _client;
}

/**
 * @param {Buffer|string} imageInput - Buffer image, data URL, ou chemin local
 * @returns {Promise<{ fullText: string, blocks: Array<{text:string,confidence:number,bbox:number[]}>, words: Array, rawPageCount: number }>}
 */
async function documentTextDetection(imageInput) {
  const t0 = Date.now();
  const client = getClient();
  const image = toVisionImage(imageInput);

  let result;
  try {
    [result] = await client.documentTextDetection(image);
  } catch (err) {
    const code = err?.code || err?.statusDetails || 'GOOGLE_VISION_ERROR';
    console.error('[googleVision] documentTextDetection failed', {
      error_code: String(code).slice(0, 80),
      message: String(err?.message || 'error').slice(0, 120),
      ms: Date.now() - t0,
    });
    const e = new Error('Échec Google Cloud Vision');
    e.code = 'GOOGLE_VISION_ERROR';
    e.cause = err;
    throw e;
  }

  const annotation = result?.fullTextAnnotation || null;
  const fullText = annotation?.text || '';
  const blocks = [];
  const words = [];

  for (const page of annotation?.pages || []) {
    for (const block of page.blocks || []) {
      const blockText = blockToText(block);
      const conf = typeof block.confidence === 'number' ? block.confidence : 0;
      const bbox = verticesToBbox(block.boundingBox?.vertices);
      if (blockText) {
        blocks.push({ text: blockText, confidence: conf, bbox });
      }
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const wText = symbolsToText(word.symbols);
          if (!wText) continue;
          words.push({
            text: wText,
            confidence: typeof word.confidence === 'number' ? word.confidence : conf,
            bbox: verticesToBbox(word.boundingBox?.vertices),
          });
        }
      }
    }
  }

  // Fallback : si pages vides mais textAnnotations présentes
  if (!blocks.length && Array.isArray(result?.textAnnotations) && result.textAnnotations.length > 1) {
    for (const ann of result.textAnnotations.slice(1)) {
      const t = (ann.description || '').trim();
      if (!t) continue;
      blocks.push({
        text: t,
        confidence: 0.8,
        bbox: verticesToBbox(ann.boundingPoly?.vertices),
      });
    }
  }

  console.info('[googleVision] ok', {
    ms: Date.now() - t0,
    pages: annotation?.pages?.length || 0,
    blocks: blocks.length,
    words: words.length,
    fullTextLen: fullText.length,
  });

  return {
    fullText,
    blocks,
    words,
    rawPageCount: annotation?.pages?.length || 0,
  };
}

function toVisionImage(imageInput) {
  if (Buffer.isBuffer(imageInput)) {
    return { image: { content: imageInput.toString('base64') } };
  }
  if (typeof imageInput === 'string') {
    const s = imageInput.trim();
    if (s.startsWith('data:')) {
      const b64 = s.includes(',') ? s.split(',', 2)[1] : s;
      return { image: { content: b64 } };
    }
    // chemin fichier
    if (fs.existsSync(s)) {
      return { image: { source: { filename: s } } };
    }
    // suppose déjà du base64 brut
    return { image: { content: s.replace(/\s+/g, '') } };
  }
  const err = new Error('Image Vision invalide');
  err.code = 'INVALID_FILE';
  throw err;
}

function symbolsToText(symbols) {
  if (!Array.isArray(symbols)) return '';
  return symbols.map((sy) => sy.text || '').join('');
}

function blockToText(block) {
  const parts = [];
  for (const para of block.paragraphs || []) {
    for (const word of para.words || []) {
      parts.push(symbolsToText(word.symbols));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function verticesToBbox(vertices) {
  if (!Array.isArray(vertices) || !vertices.length) return [0, 0, 0, 0];
  const xs = vertices.map((v) => Number(v.x) || 0);
  const ys = vertices.map((v) => Number(v.y) || 0);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

module.exports = {
  documentTextDetection,
  visionAvailable,
  credentialsPath,
  getInitError: () => _initError,
};
