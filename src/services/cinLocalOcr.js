/**
 * OCR local de secours — tesseract.js (npm + assets Vite), pas de script CDN.
 */
import { createWorker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import { parseMoroccanCinTexts } from './cinLocalParser';

const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

let _workerPromise = null;

async function getWorker() {
  if (_workerPromise) return _workerPromise;
  _workerPromise = (async () => {
    LOG('Tesseract createWorker(fra)…', { workerPath, corePath });
    const worker = await createWorker('fra', 1, {
      workerPath,
      corePath,
      logger: () => {},
    });
    LOG('Tesseract worker prêt');
    return worker;
  })();
  try {
    return await _workerPromise;
  } catch (err) {
    _workerPromise = null;
    LOG('Tesseract createWorker FAIL', err?.message || err);
    throw err;
  }
}

async function ocrSide(worker, dataUrl, label) {
  if (!dataUrl) return { text: '', confidence: 0 };
  LOG(`recognize ${label} start`, { dataUrlLen: String(dataUrl).length });
  const result = await worker.recognize(dataUrl);
  const text = result?.data?.text || '';
  const confidence = (result?.data?.confidence || 0) / 100;
  LOG(`recognize ${label} done`, {
    textLen: text.length,
    confidence,
    preview: text.slice(0, 160).replace(/\s+/g, ' '),
  });
  return { text, confidence };
}

/**
 * @returns {Promise<object>} même forme que scanCIN backend
 */
export async function scanCINLocal(rectoDataUrl, versoDataUrl, { onProgress } = {}) {
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };
  LOG('scanCINLocal START');
  progress('Lecture locale du recto');
  const worker = await getWorker();
  const recto = await ocrSide(worker, rectoDataUrl, 'recto');
  let verso = { text: '', confidence: 0 };
  if (versoDataUrl) {
    progress('Lecture locale du verso');
    verso = await ocrSide(worker, versoDataUrl, 'verso');
  }
  progress('Extraction des champs');
  const parsed = parseMoroccanCinTexts(recto.text, verso.text);
  const wf = parsed.worker_form;
  const partial = !(wf.cin && wf.nom && wf.prenom);
  LOG('scanCINLocal PARSED', wf);
  progress('Vérification terminée');

  return {
    ok: true,
    partial,
    success: true,
    cin: wf.cin || '',
    prenom: wf.prenom || '',
    nom: wf.nom || '',
    date_naissance: wf.date_naissance || '',
    ville_naissance: wf.ville_naissance || '',
    nationalite: wf.nationalite || 'Marocaine',
    sexe: wf.sexe || '',
    date_expiration: wf.date_expiration || '',
    nom_arabe: '',
    prenom_arabe: '',
    fields: parsed.fields,
    confidence_globale: partial ? 'faible' : 'moyenne',
    warnings: [
      'Extraction locale (secours).',
      ...(partial ? ['Analyse partielle — vérifiez et complétez les champs.'] : []),
    ],
    progress: ['Préparation', 'Lecture locale', 'Extraction des champs', 'Vérification terminée'],
    engine_used: 'tesseract-local',
    engine_version: '5',
    models_used: { latin: 'tesseract-fra', arabic: null },
    provider: 'citymo-local',
    _ocr_provider_used: 'tesseract-local',
    _ocr_warning: partial ? 'Analyse partielle' : '',
    _ocr_partial: partial,
    _ocr_fallback: true,
    _ocr_raw_text_preview: {
      recto: (recto.text || '').slice(0, 200),
      verso: (verso.text || '').slice(0, 200),
    },
  };
}

export async function preloadLocalOcr() {
  try {
    await getWorker();
  } catch (err) {
    LOG('preloadLocalOcr failed', err?.message || err);
  }
}
