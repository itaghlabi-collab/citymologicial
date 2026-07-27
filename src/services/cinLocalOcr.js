/**
 * OCR local de secours — moteur CIN marocaine par ZONES.
 * OpenCV-like (canvas) + Tesseract.js : une zone = un OCR (pas toute la carte).
 */
import { createWorker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import { zonesForSide } from './cinZones';
import { prepareCardCanvas, cropZoneDataUrl } from './cinLocalPreprocess';
import {
  postprocessZoneText,
  parseMrzBlock,
  cleanCin,
  cleanPersonName,
  cleanDate,
  cleanSexe,
  cleanNationalite,
  cleanCity,
} from './cinPostprocess';

const LOG = (...args) => console.info('[OCR CHAIN]', ...args);

let _workerPromise = null;

async function getWorker() {
  if (_workerPromise) return _workerPromise;
  _workerPromise = (async () => {
    LOG('Tesseract createWorker(fra) zone-mode…', { workerPath, corePath });
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

function field(value, score, candidates = []) {
  const has = Boolean(value);
  let confidence = 'non_detecte';
  if (has) {
    if (score >= 0.82) confidence = 'elevee';
    else if (score >= 0.55) confidence = 'moyenne';
    else confidence = 'faible';
  }
  return {
    value: has ? value : '',
    confidence,
    confidence_pct: has ? Math.round(Math.min(1, score) * 100) : 0,
    raw: value || '',
    candidates,
  };
}

async function recognizeZone(worker, dataUrl, zone) {
  const params = {
    tessedit_pageseg_mode: String(zone.psm || 7),
  };
  if (zone.whitelist) {
    params.tessedit_char_whitelist = zone.whitelist;
  } else {
    // Réinitialiser whitelist (sinon zones suivantes restent filtrées)
    params.tessedit_char_whitelist = '';
  }
  await worker.setParameters(params);
  const result = await worker.recognize(dataUrl);
  const text = (result?.data?.text || '').replace(/\n+/g, ' ').trim();
  const confidence = (result?.data?.confidence || 0) / 100;
  return { text, confidence };
}

async function ocrSideZones(worker, dataUrl, side, onProgress) {
  if (!dataUrl) return { zones: {}, warped: false };

  onProgress?.(`Redressement ${side}`);
  const prepared = await prepareCardCanvas(dataUrl);
  const zones = zonesForSide(side);
  const byField = {};

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    onProgress?.(`Zone ${side}: ${zone.field} (${i + 1}/${zones.length})`);
    try {
      const cropUrl = cropZoneDataUrl(prepared.canvas, zone);
      const { text: raw, confidence } = await recognizeZone(worker, cropUrl, zone);
      const cleaned = postprocessZoneText(zone.field, raw);
      LOG(`zone ${side}/${zone.field}`, {
        raw: raw.slice(0, 80),
        cleaned,
        confidence,
      });

      if (zone.field === 'numero_cin_alt') {
        const existing = byField.numero_cin;
        if (cleaned && (!existing?.text || confidence > (existing.confidence || 0))) {
          byField.numero_cin = { field: 'numero_cin', raw, text: cleaned, confidence };
        }
        continue;
      }
      byField[zone.field] = { field: zone.field, raw, text: cleaned, confidence };
    } catch (err) {
      LOG(`zone ${side}/${zone.field} FAIL`, err?.message || err);
      byField[zone.field] = { field: zone.field, raw: '', text: '', confidence: 0 };
    }
  }

  // Enrichissement MRZ (verso) si champs manquants
  const mrzRaw = byField.mrz?.raw || byField.mrz?.text || '';
  if (mrzRaw) {
    const bag = parseMrzBlock(mrzRaw);
    const fill = (key, values, cleaner) => {
      if (byField[key]?.text || !values?.length) return;
      const v = cleaner(values[0]);
      if (v) byField[key] = { field: key, raw: values[0], text: v, confidence: 0.78 };
    };
    fill('numero_cin', bag.cin, cleanCin);
    fill('nom', bag.nom, cleanPersonName);
    fill('prenom', bag.prenom, cleanPersonName);
    fill('date_naissance', bag.naissance, (x) => cleanDate(x, 'naissance') || (String(x).match(/^\d{4}-\d{2}-\d{2}$/) ? x : ''));
    fill('date_expiration', bag.expiration, (x) => cleanDate(x, 'expiration') || (String(x).match(/^\d{4}-\d{2}-\d{2}$/) ? x : ''));
    fill('sexe', bag.sexe, cleanSexe);
  }

  return { zones: byField, warped: prepared.warped };
}

function mergeZoneSides(rectoZones, versoZones) {
  const pick = (key, prefer = 'recto') => {
    const a = rectoZones[key];
    const b = versoZones[key];
    if (prefer === 'verso') {
      if (b?.text) return b;
      return a;
    }
    if (a?.text) return a;
    return b;
  };

  const nom = pick('nom');
  const prenom = pick('prenom');
  const cin = pick('numero_cin');
  const dn = pick('date_naissance');
  const lieu = pick('lieu_naissance');
  const sexe = pick('sexe');
  const nat = pick('nationalite') || { text: 'Marocaine', confidence: 0.5 };
  const de = pick('date_expiration', 'verso');
  const autorite = pick('autorite', 'verso');

  const fields = {
    numero_cin: field(cin?.text || '', cin?.confidence || 0),
    nom: field(nom?.text || '', nom?.confidence || 0),
    prenom: field(prenom?.text || '', prenom?.confidence || 0),
    date_naissance: field(dn?.text || '', dn?.confidence || 0),
    lieu_naissance: field(lieu?.text || cleanCity(lieu?.raw || '') || '', lieu?.confidence || 0),
    date_expiration: field(de?.text || '', de?.confidence || 0),
    sexe: field(sexe?.text || '', sexe?.confidence || 0),
    nationalite: field(cleanNationalite(nat?.text || 'Marocaine'), 0.7),
    nom_arabe: field(rectoZones.nom_arabe?.text || '', rectoZones.nom_arabe?.confidence || 0),
    prenom_arabe: field(rectoZones.prenom_arabe?.text || '', rectoZones.prenom_arabe?.confidence || 0),
    autorite: field(autorite?.text || '', autorite?.confidence || 0),
  };

  return {
    fields,
    worker_form: {
      cin: fields.numero_cin.value,
      prenom: fields.prenom.value,
      nom: fields.nom.value,
      date_naissance: fields.date_naissance.value,
      ville_naissance: fields.lieu_naissance.value,
      nationalite: fields.nationalite.value || 'Marocaine',
      sexe: fields.sexe.value,
      date_expiration: fields.date_expiration.value,
    },
  };
}

/**
 * @returns {Promise<object>} même forme que scanCIN backend
 */
export async function scanCINLocal(rectoDataUrl, versoDataUrl, { onProgress } = {}) {
  const progress = (s) => { try { onProgress?.(s); } catch (_) { /* */ } };
  LOG('scanCINLocal START (zone engine)');
  progress('Préparation locale');
  const worker = await getWorker();

  progress('Zones recto');
  const recto = await ocrSideZones(worker, rectoDataUrl, 'recto', progress);
  let verso = { zones: {} };
  if (versoDataUrl) {
    progress('Zones verso');
    verso = await ocrSideZones(worker, versoDataUrl, 'verso', progress);
  }

  progress('Post-traitement');
  const parsed = mergeZoneSides(recto.zones || {}, verso.zones || {});
  const wf = parsed.worker_form;
  const partial = !(wf.cin && wf.nom && wf.prenom);
  LOG('scanCINLocal PARSED (zones)', wf);

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
    nom_arabe: parsed.fields.nom_arabe?.value || '',
    prenom_arabe: parsed.fields.prenom_arabe?.value || '',
    fields: parsed.fields,
    confidence_globale: partial ? 'faible' : 'moyenne',
    warnings: [
      'Extraction locale par zones CIN.',
      ...(partial ? ['Analyse partielle — vérifiez et complétez les champs.'] : []),
    ],
    progress: ['Préparation', 'Zones recto', 'Zones verso', 'Post-traitement', 'Vérification terminée'],
    engine_used: 'tesseract-zones',
    engine_version: 'zone-v1',
    models_used: { latin: 'tesseract-fra', arabic: null, mode: 'zone' },
    provider: 'citymo-local',
    ocr_mode: 'zone',
    _ocr_provider_used: 'tesseract-zones',
    _ocr_warning: partial ? 'Analyse partielle' : '',
    _ocr_partial: partial,
    _ocr_fallback: true,
    _ocr_zones: {
      recto: Object.fromEntries(
        Object.entries(recto.zones || {}).map(([k, v]) => [k, { text: v.text, conf: v.confidence }]),
      ),
      verso: Object.fromEntries(
        Object.entries(verso.zones || {}).map(([k, v]) => [k, { text: v.text, conf: v.confidence }]),
      ),
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
