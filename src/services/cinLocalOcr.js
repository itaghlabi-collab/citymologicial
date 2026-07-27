/**
 * OCR local de secours (Tesseract.js CDN) — utilisé seulement si le service Python
 * CITYMO est indisponible / non configuré.
 */
import { parseMoroccanCinTexts } from './cinLocalParser';

const TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let _tessPromise = null;

async function loadTesseract() {
  if (typeof window === 'undefined') throw new Error('OCR local navigateur uniquement');
  if (window.Tesseract) return window.Tesseract;
  if (_tessPromise) return _tessPromise;
  _tessPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESS_CDN;
    s.async = true;
    s.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('Tesseract non chargé'));
    };
    s.onerror = () => reject(new Error('Impossible de charger le moteur OCR local'));
    document.head.appendChild(s);
  });
  return _tessPromise;
}

async function ocrSide(Tesseract, dataUrl, onProgress) {
  if (!dataUrl) return { text: '', confidence: 0 };
  onProgress?.();
  const result = await Tesseract.recognize(dataUrl, 'fra', {
    logger: () => {},
  });
  const text = result?.data?.text || '';
  const confidence = (result?.data?.confidence || 0) / 100;
  return { text, confidence };
}

/**
 * @returns {Promise<object>} même forme que scanCIN backend
 */
export async function scanCINLocal(rectoDataUrl, versoDataUrl, { onProgress } = {}) {
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };
  progress('Lecture locale du recto');
  const Tesseract = await loadTesseract();
  const recto = await ocrSide(Tesseract, rectoDataUrl, () => progress('Lecture locale du recto'));
  let verso = { text: '', confidence: 0 };
  if (versoDataUrl) {
    progress('Lecture locale du verso');
    verso = await ocrSide(Tesseract, versoDataUrl);
  }
  progress('Extraction des champs');
  const parsed = parseMoroccanCinTexts(recto.text, verso.text);
  const wf = parsed.worker_form;
  const partial = !(wf.cin && wf.nom && wf.prenom);
  progress('Vérification terminée');

  return {
    ok: true,
    partial,
    cin: wf.cin,
    prenom: wf.prenom,
    nom: wf.nom,
    date_naissance: wf.date_naissance,
    ville_naissance: wf.ville_naissance,
    nationalite: wf.nationalite || 'Marocaine',
    sexe: wf.sexe,
    date_expiration: wf.date_expiration,
    nom_arabe: '',
    prenom_arabe: '',
    fields: parsed.fields,
    confidence_globale: partial ? 'faible' : 'moyenne',
    warnings: [
      'Extraction locale (secours) — déployez le service OCR CITYMO pour une meilleure précision.',
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
  };
}

export async function preloadLocalOcr() {
  try {
    await loadTesseract();
  } catch (_) { /* ignore */ }
}
