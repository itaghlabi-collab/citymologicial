/**
 * Orchestration scan CNIE via Google Vision.
 * Contrat compatible frontend / mapResponse de workersCin.js.
 */
'use strict';

const googleVision = require('./googleVision');
const parser = require('./cnieGoogleParser');

const EMPTY_VISION = { fullText: '', blocks: [], words: [], rawPageCount: 0 };

function dataUrlToBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s.startsWith('data:')) {
    const b64 = s.includes(',') ? s.split(',', 2)[1] : '';
    return Buffer.from(b64, 'base64');
  }
  // raw base64
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100) {
    return Buffer.from(s.replace(/\s+/g, ''), 'base64');
  }
  return null;
}

/**
 * @param {{ front: string|Buffer|null, back: string|Buffer|null, force?: boolean }} opts
 */
async function analyzeCnieGoogle({ front, back, force = false }) {
  const t0 = Date.now();
  const progress = ['engine:google_vision'];

  if (!googleVision.visionAvailable()) {
    console.warn('[cnieGoogleAnalyze] credentials missing or file not found');
    return {
      ok: false,
      success: false,
      error: 'OCR Google Vision non configuré — saisie manuelle disponible',
      error_code: 'OCR_NOT_CONFIGURED',
      allow_force: true,
      progress,
      warnings: ['Configurez GOOGLE_APPLICATION_CREDENTIALS ou GOOGLE_VISION_KEY_FILE'],
      engine_used: 'google_vision',
      mode: 'suggestion',
      requires_manual_review: true,
    };
  }

  const frontBuf = dataUrlToBuffer(front);
  const backBuf = dataUrlToBuffer(back);
  const hasFront = Boolean(frontBuf && frontBuf.length >= 100);
  const hasBack = Boolean(backBuf && backBuf.length >= 100);

  if (!hasFront && !hasBack) {
    return {
      ok: false,
      success: false,
      error: 'Aucune image exploitable — importez le recto et/ou le verso',
      error_code: 'INVALID_FILE',
      allow_force: false,
      progress,
      engine_used: 'google_vision',
      mode: 'suggestion',
      requires_manual_review: true,
    };
  }

  let frontResult = EMPTY_VISION;
  let backResult = EMPTY_VISION;
  try {
    if (hasFront) {
      progress.push('vision:front');
      frontResult = await googleVision.documentTextDetection(frontBuf);
    } else {
      progress.push('vision:front:skipped');
    }
    if (hasBack) {
      progress.push('vision:back');
      backResult = await googleVision.documentTextDetection(backBuf);
    } else {
      progress.push('vision:back:skipped');
    }
  } catch (err) {
    console.error('[cnieGoogleAnalyze] vision error', {
      code: err.code || 'GOOGLE_VISION_ERROR',
      ms: Date.now() - t0,
    });
    return {
      ok: false,
      success: false,
      error: 'Analyse Google Vision impossible — saisie manuelle disponible',
      error_code: err.code || 'GOOGLE_VISION_ERROR',
      allow_force: true,
      progress,
      warnings: ['Le formulaire reste utilisable en saisie manuelle'],
      engine_used: 'google_vision',
      mode: 'suggestion',
      requires_manual_review: true,
      duration_ms: Date.now() - t0,
    };
  }

  const frontLen = (frontResult.fullText || '').trim().length;
  const backLen = (backResult.fullText || '').trim().length;

  if (!force && frontLen < 8 && backLen < 8) {
    return {
      ok: false,
      success: false,
      error: 'Texte non détecté — image floue, trop sombre, ou illisible. Saisie manuelle disponible.',
      error_code: 'OCR_EMPTY',
      allow_force: true,
      progress,
      warnings: ['Aucune donnée personnelle n\'a été extraite'],
      engine_used: 'google_vision',
      mode: 'suggestion',
      requires_manual_review: true,
      duration_ms: Date.now() - t0,
    };
  }

  progress.push('parse:cnie');
  let fields = parser.parseCnieFromVision(frontResult, backResult);
  let faces_swapped = false;

  // Recto/verso éventuellement inversés : garder le meilleur parse
  if (hasFront && hasBack) {
    const scoreA = parser.scoreParsedFields(fields);
    const alt = parser.parseCnieFromVision(backResult, frontResult);
    const scoreB = parser.scoreParsedFields(alt);
    if (scoreB > scoreA + 0.35) {
      fields = alt;
      faces_swapped = true;
      progress.push('faces:swapped');
    }
  }

  const worker_form = parser.toWorkerForm(fields, 0.7);
  const validCount = Object.values(fields).filter((f) => f.valid && f.value).length;
  const warnings = ['Mode suggestion — validez avant sauvegarde'];
  if (!hasFront || !hasBack) {
    warnings.push('Une seule face fournie — extraction partielle possible');
  }
  if (faces_swapped) {
    warnings.push('Recto/verso détectés comme inversés — parse corrigé automatiquement');
  }

  console.info('[cnieGoogleAnalyze] done', {
    ms: Date.now() - t0,
    fields_valid: validCount,
    has_cin: Boolean(fields.cin?.value),
    has_names: Boolean(fields.nom?.value && fields.prenom?.value),
    faces_swapped,
    single_face: !(hasFront && hasBack),
    // pas de valeurs PII
  });

  return {
    ok: true,
    success: true,
    status: 'success',
    fields,
    worker_form,
    confidence_globale: parser.globalConfidenceLabel(fields),
    progress,
    warnings,
    faces: { swapped: faces_swapped, has_front: hasFront, has_back: hasBack },
    faces_swapped,
    engine_used: 'google_vision',
    engine_version: 'google-cloud-vision',
    duration_ms: Date.now() - t0,
    partial: validCount < 4 || !(hasFront && hasBack),
    mode: 'suggestion',
    requires_manual_review: true,
    provider: 'google_vision',
  };
}

module.exports = {
  analyzeCnieGoogle,
};
