/**
 * crmPdfParser.js — Extraction texte + métadonnées depuis PDF legacy CITYMO
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const CITYMO_COMPANY_ICE = '002023116000060';

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
    if (m) {
      const val = (m[1] || m[0] || '').trim();
      if (val) return val;
    }
  }
  return '';
}

function lastMatch(text, patterns) {
  let found = '';
  for (const re of patterns) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const globalRe = new RegExp(re.source, flags);
    let m;
    while ((m = globalRe.exec(text)) !== null) {
      const val = (m[1] || '').trim();
      if (val) found = val;
    }
  }
  return found;
}

/** Bloc totaux CITYMO : « Total HT : 85 896,00 MAD » (pas les colonnes du tableau) */
function extractCitymoTotals(text) {
  const total_ht = parseAmount(lastMatch(text, [
    /Total\s*HT\s*:\s*([\d\s.,]+)\s*MAD/gi,
  ]));
  const total_tva = parseAmount(lastMatch(text, [
    /TVA\s*:\s*([\d\s.,]+)\s*MAD/gi,
  ]));
  const total_ttc = parseAmount(lastMatch(text, [
    /Total\s*TTC\s*:\s*([\d\s.,]+)\s*MAD/gi,
  ]));

  if (total_ht != null || total_tva != null || total_ttc != null) {
    return { total_ht, total_tva, total_ttc };
  }

  return {
    total_ht: parseAmount(firstMatch(text, [/Total\s*HT\s*:?\s*([\d\s.,]+)\s*MAD/i])),
    total_tva: parseAmount(firstMatch(text, [/TVA\s*:\s*([\d\s.,]+)\s*MAD/i])),
    total_ttc: parseAmount(firstMatch(text, [/Total\s*TTC\s*:?\s*([\d\s.,]+)\s*MAD/i])),
  };
}

function extractClientNameFromFileName(fileName) {
  const m = String(fileName || '').match(/^(?:FAC|PR|FA)-[\w-]+\s*-\s*(.+?)\.pdf$/i);
  return m ? m[1].trim() : '';
}

function extractCitymoClientName(text, fileName) {
  const fromFile = extractClientNameFromFileName(fileName);
  if (fromFile) return fromFile.slice(0, 200);

  const afterCompany = text.match(
    new RegExp(`ICE:\\s*${CITYMO_COMPANY_ICE}\\s+([A-ZÉÈÀÂÊÎÔÛ0-9][A-ZÉÈÀÂÊÎÔÛ0-9 '&.\\-]{2,80}?)\\s+(?:MOROCCO|CASABLANCA|RABAT|TANGER|FES|MARRAKECH|\\d)`,i),
  );
  if (afterCompany?.[1]) return afterCompany[1].trim().slice(0, 200);

  return firstMatch(text, [
    /Client\s*:?\s*([^\n]+?)(?:\s+ICE|\s+T[ée]l|\s+Email|$)/i,
    /Raison\s+sociale\s*:?\s*([^\n]+)/i,
  ]).slice(0, 200);
}

function extractCitymoClientIce(text) {
  const all = [...text.matchAll(/ICE\s*:\s*(\d{15})/gi)].map((m) => m[1]);
  const clientOnly = all.find((ice) => ice !== CITYMO_COMPANY_ICE);
  return clientOnly || null;
}

function extractFactureReference(text, fileName) {
  return firstMatch(text, [
    /FACTURE\s+(FAC-\d{4}-\d{3,})/i,
    /\b(FAC-\d{4}-\d{3,})\b/i,
    /\b(FA-\d{4}-\d{2}-\d+)\b/i,
  ]) || firstMatch(fileName, [
    /\b(FAC-\d{4}-\d{3,})\b/i,
    /\b(FA-\d{4}-\d{2}-\d+)\b/i,
  ]);
}

function extractDevisReference(text) {
  return firstMatch(text, [
    /R[ée]f[ée]rence devis\s*:\s*(PR-\d{4}-\d{2}-\d+)/i,
    /Devis\s*(?:N[°º]?|li[ée])\s*:?\s*(PR-\d{4}-\d{2}-\d+)/i,
    /\b(PR-\d{4}-\d{2}-\d+)\b/i,
  ]) || null;
}

function extractIntitule(text, fileName, docType) {
  const fromObjet = firstMatch(text, [
    /(?:Objet|Intitul[ée]|Titre)\s*:?\s*([^\n]+)/i,
    /(?:Projet|Prestation)\s*:?\s*([^\n]+)/i,
  ]);
  if (fromObjet) return fromObjet.slice(0, 300);

  const firstLine = firstMatch(text, [
    /DÉSIGNATION\s+UNITÉ[\s\S]*?\d+\s+([A-Za-zÉÈÀÂÊÎÔÛ0-9][^\n]{8,120}?)\s+(?:m²|lot|unité|u\b)/i,
    /#\s+DÉSIGNATION[\s\S]{0,400}?\d+\s+([A-Za-zÉÈÀÂÊÎÔÛ][^\n]{8,100})/i,
  ]);
  if (firstLine) return firstLine.trim().slice(0, 300);

  const fn = extractClientNameFromFileName(fileName);
  if (fn && docType === 'facture') {
    const ref = extractFactureReference(text, fileName);
    return ref ? `${ref} — ${fn}` : fn;
  }

  return null;
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
  const snippet = text.slice(0, 2500);

  let docType = 'devis';
  if (
    /\bFACTURE\b/i.test(text)
    || /\bFAC-\d{4}-/i.test(text)
    || /\bFA-\d{4}-\d{2}-\d+/i.test(text)
    || /^FAC-/i.test(fileName)
    || /facture/i.test(fileName)
  ) {
    docType = 'facture';
  } else if (
    /\bDEVIS\b/i.test(text)
    || /\bPR-\d{4}-\d{2}-\d+/i.test(text)
    || /^PR-/i.test(fileName)
  ) {
    docType = 'devis';
  }

  let reference = '';
  let devis_reference = null;

  if (docType === 'facture') {
    reference = extractFactureReference(text, fileName);
    devis_reference = extractDevisReference(text);
    if (devis_reference === reference) devis_reference = extractDevisReference(text.replace(reference, ''));
  } else {
    reference = firstMatch(text, [
      /DEVIS\s+(PR-\d{4}-\d{2}-\d+)/i,
      /\b(PR-\d{4}-\d{2}-\d+)\b/i,
    ]) || firstMatch(fileName, [/\b(PR-\d{4}-\d{2}-\d+)\b/i]);
  }

  const dateStr = firstMatch(text, [
    /Date\s*:\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:Émis|Emis|Créé|Cree)\s*(?:le)?\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ]);
  const date_document = parseDate(dateStr);

  const echeanceStr = firstMatch(text, [
    /[ÉE]ch[ée]ance\s*:\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ]);
  const date_echeance = parseDate(echeanceStr);

  const client_detected_name = extractCitymoClientName(text, fileName);
  const client_ice = extractCitymoClientIce(text);

  const client_email = firstMatch(text, [
    /Email\s*:\s*([\w.+-]+@[\w.-]+\.\w+)/i,
  ]);

  const client_telephone = firstMatch(text, [
    /T[ée]l(?:[ée]phone)?\s*:\s*([+\d\s()./-]{8,20})/i,
    /(\+212[\d\s]{8,14})/,
    /(0[567]\d{8})/,
  ]);

  const intitule = extractIntitule(text, fileName, docType);
  const { total_ht, total_tva, total_ttc } = extractCitymoTotals(text);

  if (!text || text.length < 20) {
    errors.push('Texte PDF illisible ou vide.');
  }
  if (!reference) errors.push('Référence non détectée.');
  if (!date_document) errors.push('Date non détectée.');
  if (!client_detected_name && !client_ice) errors.push('Client non identifié dans le PDF.');
  if (total_ttc == null && total_ht == null) errors.push('Montants non détectés dans le PDF.');

  let statut = 'pret_import';
  if (errors.some((e) => e.includes('illisible'))) {
    statut = 'erreur_lecture';
  } else if (!client_detected_name && !client_ice && !client_email) {
    statut = 'client_a_verifier';
  }

  return {
    doc_type: docType,
    reference: reference || null,
    devis_reference,
    date_document,
    date_echeance,
    intitule: intitule || null,
    client_detected_name: client_detected_name || null,
    client_ice: client_ice || null,
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
      devis_reference: null,
      date_document: null,
      date_echeance: null,
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
