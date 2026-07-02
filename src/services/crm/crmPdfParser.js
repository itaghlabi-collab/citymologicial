/**
 * crmPdfParser.js — Extraction texte + métadonnées depuis PDF legacy CITYMO
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAmount(str) {
  if (!str) return null;
  const cleaned = String(str)
    .replace(/\s/g, '')
    .replace(/MAD|DH|Dhs?/gi, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] || m[0] || '').trim();
  }
  return '';
}

export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => it.str).join(' ');
    pages.push(line);
  }
  return normalizeText(pages.join('\n'));
}

/**
 * Heuristiques pour PDF CITYMO / logiciel legacy
 */
export function parseArchiveMetadata(text, fileName = '') {
  const errors = [];
  const upper = text.toUpperCase();
  const snippet = text.slice(0, 2000);

  let docType = 'devis';
  if (
    /\bFACTURE\b/i.test(text)
    || /\bFA-\d{4}-\d{2}-\d+/i.test(text)
    || /N[°º]?\s*FA/i.test(text)
  ) {
    docType = 'facture';
  } else if (
    /\bDEVIS\b/i.test(text)
    || /\bPR-\d{4}-\d{2}-\d+/i.test(text)
    || /N[°º]?\s*PR/i.test(text)
  ) {
    docType = 'devis';
  } else if (/facture/i.test(fileName)) {
    docType = 'facture';
  }

  const reference = firstMatch(text, [
    /\b(PR-\d{4}-\d{2}-\d+)\b/i,
    /\b(FA-\d{4}-\d{2}-\d+)\b/i,
    /(?:DEVIS|FACTURE)\s*N[°º]?\s*:?\s*([A-Z0-9][\w\-\/]+)/i,
    /R[ée]f(?:[ée]rence)?\s*:?\s*([A-Z0-9][\w\-\/]+)/i,
  ]) || firstMatch(fileName, [/([A-Z]{2,}-\d{4}-\d{2}-\d+)/i]);

  const dateStr = firstMatch(text, [
    /Date\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:Émis|Emis|Créé|Cree)\s*(?:le)?\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/,
  ]);
  const date_document = parseDate(dateStr);

  const ice = firstMatch(text, [
    /ICE\s*:?\s*(\d{15})/i,
    /\b(\d{15})\b/,
  ]);

  let client_detected_name = firstMatch(text, [
    /Client\s*:?\s*([^\n]+?)(?:\s+ICE|\s+T[ée]l|\s+Email|$)/i,
    /Raison\s+sociale\s*:?\s*([^\n]+)/i,
    /Soci[ée]t[ée]\s*:?\s*([^\n]+)/i,
  ]);
  client_detected_name = client_detected_name.replace(/\s{2,}/g, ' ').slice(0, 200);

  const client_email = firstMatch(text, [
    /[Ee]mail\s*:?\s*([\w.+-]+@[\w.-]+\.\w+)/,
    /([\w.+-]+@[\w.-]+\.\w+)/,
  ]);

  const client_telephone = firstMatch(text, [
    /T[ée]l(?:[ée]phone)?\s*:?\s*([+\d\s()./-]{8,20})/i,
    /(\+212[\d\s]{8,14})/,
    /(0[567]\d{8})/,
  ]);

  const intitule = firstMatch(text, [
    /(?:Objet|Intitul[ée]|Titre)\s*:?\s*([^\n]+)/i,
    /(?:Projet|Prestation)\s*:?\s*([^\n]+)/i,
  ]).slice(0, 300);

  const total_ht = parseAmount(firstMatch(text, [
    /Total\s*HT\s*:?\s*([\d\s.,]+)/i,
    /Montant\s*HT\s*:?\s*([\d\s.,]+)/i,
  ]));
  const total_tva = parseAmount(firstMatch(text, [
    /(?:TVA|T\.V\.A\.?)\s*(?:\d+%)?\s*:?\s*([\d\s.,]+)/i,
  ]));
  const total_ttc = parseAmount(firstMatch(text, [
    /Total\s*TTC\s*:?\s*([\d\s.,]+)/i,
    /Montant\s*TTC\s*:?\s*([\d\s.,]+)/i,
    /Net\s+[àa]\s+payer\s*:?\s*([\d\s.,]+)/i,
  ]));

  if (!text || text.length < 20) {
    errors.push('Texte PDF illisible ou vide.');
  }
  if (!reference) errors.push('Référence non détectée.');
  if (!date_document) errors.push('Date non détectée.');
  if (!client_detected_name && !ice) errors.push('Client non identifié dans le PDF.');

  let statut = 'pret_import';
  if (errors.some((e) => e.includes('illisible'))) {
    statut = 'erreur_lecture';
  } else if (!client_detected_name && !ice && !client_email) {
    statut = 'client_a_verifier';
  }

  return {
    doc_type: docType,
    reference: reference || null,
    date_document,
    intitule: intitule || null,
    client_detected_name: client_detected_name || null,
    client_ice: ice || null,
    client_email: client_email || null,
    client_telephone: client_telephone || null,
    total_ht,
    total_tva,
    total_ttc,
    statut,
    detection_errors: errors.length ? errors.join(' ') : null,
    extraction_snippet: snippet,
  };
}

export async function analyzeArchivePdf(file) {
  try {
    const text = await extractPdfText(file);
    return parseArchiveMetadata(text, file.name);
  } catch (err) {
    console.error('[CITYMO] crm pdf parse', err);
    return {
      doc_type: 'devis',
      reference: null,
      date_document: null,
      intitule: null,
      client_detected_name: null,
      client_ice: null,
      client_email: null,
      client_telephone: null,
      total_ht: null,
      total_tva: null,
      total_ttc: null,
      statut: 'erreur_lecture',
      detection_errors: err.message || 'Erreur lecture PDF.',
      extraction_snippet: '',
    };
  }
}
