/**
 * Parser CNIE marocaine — Google Vision → champs structurés.
 *
 * Stratégie (par priorité) :
 *   1. MRZ du verso (nom, prénom, dates, sexe, nationalité) — très fiable
 *   2. Labels français du recto (NOM, PRENOM, Née le, à …) avec bounding boxes
 *   3. Labels arabes (مزدادة بتاريخ, ب …, الجنس, …)
 *   4. Regex fallback sur fullText (dernière option)
 *
 * Ne jamais logger de données personnelles.
 */
'use strict';

/* ── Helpers ────────────────────────────────────────── */

const OCR_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

function confidenceLevelFromScore(conf) {
  if (conf >= 0.85) return 'haute';
  if (conf >= 0.70) return 'moyenne';
  return 'faible';
}

function emptyField(source = 'google_vision') {
  return {
    value: null, confidence: 0, confidence_level: 'faible',
    confidence_from_vision: false, valid: false, source,
    requires_manual_review: true,
  };
}

function makeField(value, confidence, source = 'google_vision', review = false, opts = {}) {
  if (value == null || String(value).trim() === '') return emptyField(source);
  const conf = Math.max(0, Math.min(1, Number(confidence) || 0));
  return {
    value: String(value).trim(),
    confidence: conf,
    confidence_level: confidenceLevelFromScore(conf),
    confidence_from_vision: opts.fromVision === true,
    valid: conf >= 0.45,
    source,
    requires_manual_review: review || conf < 0.85,
  };
}

function normText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeCin(raw) {
  let s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z]{1,2})(.+)$/);
  if (!m) return s;
  const head = m[1];
  const rest = m[2].split('').map((c) => OCR_DIGIT[c] || c).join('').replace(/\D/g, '');
  return head + rest;
}

function isValidCin(v) {
  return /^[A-Z]{1,2}\d{4,7}$/.test(v) && v.length >= 5 && v.length <= 9;
}

function toIso(d, m, y) {
  let yy = y;
  if (yy < 100) yy = yy < 40 ? 2000 + yy : 1900 + yy;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && yy >= 1920 && yy <= 2100)) return null;
  const dt = new Date(Date.UTC(yy, m - 1, d));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(yy).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateToken(raw) {
  const m = String(raw || '').match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (!m) return null;
  return toIso(+m[1], +m[2], +m[3]) || toIso(+m[2], +m[1], +m[3]);
}

function isMrzLike(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  return compact.length >= 20 && /^[A-Z0-9<]+$/.test(compact) && /[<]{2,}/.test(compact);
}

function isHeader(t) {
  return /ROYAUME|MAROC|CARTE\s*NATIONALE|IDENTITE|IDENTITÉ|المملكة|المغربية|البطاقة|الوطنية|للتعريف/i.test(t);
}

function isArabic(t) {
  return /[\u0600-\u06FF]/.test(t);
}

function isLatinName(s) {
  const t = String(s || '').trim();
  if (t.length < 2 || t.length > 40) return false;
  if (isHeader(t) || isMrzLike(t)) return false;
  if (/\d/.test(t)) return false;
  return /^[A-Za-zÀ-ÿ' -]+$/.test(t);
}

/* ── MRZ Parser (Moroccan CNIE — 3×30) ─────────────── */

function extractMRZ(fullText) {
  const lines = String(fullText || '').split(/\n+/);
  const mrzCandidates = [];
  for (const line of lines) {
    const compact = line.replace(/\s/g, '');
    if (compact.length >= 28 && compact.length <= 36 && /^[A-Z0-9<]+$/.test(compact)) {
      mrzCandidates.push(compact.padEnd(30, '<').slice(0, 30));
    }
  }

  if (mrzCandidates.length < 3) return null;
  const mrz = mrzCandidates.slice(-3);

  const l1 = mrz[0]; // IDMAR + CIN/doc number + check + filler
  const l2 = mrz[1]; // birth(6) + check + sex(1) + expiry(6) + check + nationality(3) + filler + check
  const l3 = mrz[2]; // LASTNAME<<FIRSTNAME<<<...

  const result = {};

  // L3: names
  const namesPart = l3.replace(/<+$/, '');
  const nameParts = namesPart.split('<<');
  if (nameParts.length >= 2) {
    result.nom = nameParts[0].replace(/</g, ' ').trim();
    result.prenom = nameParts[1].replace(/</g, ' ').trim();
  } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
    result.nom = nameParts[0].replace(/</g, ' ').trim();
  }

  // L2: birth YYMMDD (pos 0-5), check (pos 6), sex (pos 7), expiry YYMMDD (pos 8-13)
  const birthYY = parseInt(l2.slice(0, 2), 10);
  const birthMM = parseInt(l2.slice(2, 4), 10);
  const birthDD = parseInt(l2.slice(4, 6), 10);
  const birthIso = toIso(birthDD, birthMM, birthYY);
  if (birthIso) result.date_naissance = birthIso;

  const sexChar = l2.charAt(7);
  if (sexChar === 'M' || sexChar === 'F') result.sexe = sexChar;

  const expYY = parseInt(l2.slice(8, 10), 10);
  const expMM = parseInt(l2.slice(10, 12), 10);
  const expDD = parseInt(l2.slice(12, 14), 10);
  const expIso = toIso(expDD, expMM, expYY);
  if (expIso) result.date_expiration = expIso;

  const natSlice = l2.slice(15, 18);
  if (natSlice === 'MAR') result.nationalite = 'Marocaine';

  // L1: CIN after IDMAR
  const l1m = l1.match(/^IDMAR(.+?)(<|$)/);
  if (l1m) {
    const docNum = l1m[1].replace(/</g, '');
    if (docNum.length >= 5) result.cin_mrz = docNum;
  }

  return result;
}

/* ── Recto text analysis (labels + bboxes) ─────────── */

function collectLines(visionResult, side) {
  const out = [];
  for (const b of visionResult?.blocks || []) {
    out.push({
      text: (b.text || '').trim(),
      confidence: b.confidence || 0.7,
      bbox: b.bbox || [0, 0, 0, 0],
      side,
    });
  }
  return out;
}

function extractRectoFields(blocks) {
  const result = {};
  const sorted = [...blocks].sort((a, b) => a.bbox[1] - b.bbox[1]);
  const imgW = Math.max(...blocks.map((b) => b.bbox[2]), 1);
  const imgH = Math.max(...blocks.map((b) => b.bbox[3]), 1);

  // Identify left-side Latin blocks (names, labels) vs right-side Arabic blocks
  // On CNIE recto: left half = French text, right half = Arabic text
  // Names are in the center-left area, below the header

  const isLeftHalf = (b) => ((b.bbox[0] + b.bbox[2]) / 2) < imgW * 0.65;
  const isRightHalf = (b) => ((b.bbox[0] + b.bbox[2]) / 2) > imgW * 0.55;

  const latinBlocks = sorted.filter(
    (b) => isLeftHalf(b) && !isHeader(b.text) && !isMrzLike(b.text) && !isArabic(b.text)
  );

  // Find CIN: block matching pattern, usually near bottom-left of recto or top-right
  for (const b of sorted) {
    if (isMrzLike(b.text)) continue;
    const cleaned = b.text.replace(/^(N[°O.]?|NO|NUM)\s*/i, '').replace(/\s/g, '');
    const cin = normalizeCin(cleaned);
    if (isValidCin(cin)) {
      result.cin = { value: cin, confidence: b.confidence || 0.85 };
      break;
    }
  }

  // Find names from Latin labels in left half
  // Strategy: look for blocks that are purely Latin names (no labels, no dates)
  const nameBlocks = latinBlocks.filter((b) => {
    const t = b.text.trim();
    if (!isLatinName(t)) return false;
    if (/^(No|Née?\s+le|Valable|CIN|Sexe|N°)$/i.test(t)) return false;
    if (/^[A-Z]{1}$/i.test(t)) return false;
    return true;
  });

  // Names appear in order: first = prénom, second = nom (top to bottom)
  if (nameBlocks.length >= 2) {
    result.prenom = { value: nameBlocks[0].text.trim().toUpperCase(), confidence: nameBlocks[0].confidence || 0.8 };
    result.nom = { value: nameBlocks[1].text.trim().toUpperCase(), confidence: nameBlocks[1].confidence || 0.8 };
  } else if (nameBlocks.length === 1) {
    result.prenom = { value: nameBlocks[0].text.trim().toUpperCase(), confidence: (nameBlocks[0].confidence || 0.7) * 0.8 };
  }

  // Find "Née le" or date blocks near it
  for (const b of latinBlocks) {
    if (/N[ée]{1,2}e?\s+le/i.test(b.text)) {
      const dateMatch = b.text.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
      if (dateMatch) {
        const iso = parseDateToken(dateMatch[0]);
        if (iso) result.date_naissance = { value: iso, confidence: b.confidence || 0.85 };
      }
    }
    // "à CITY" → lieu de naissance
    const lieuMatch = b.text.match(/^[àa]\s+(.+)$/i);
    if (lieuMatch) {
      const lieu = lieuMatch[1].trim();
      if (lieu.length >= 3 && !isMrzLike(lieu)) {
        result.lieu_naissance = { value: lieu.toUpperCase(), confidence: b.confidence || 0.78 };
      }
    }
  }

  // Find date from standalone date blocks near the names zone
  if (!result.date_naissance) {
    for (const b of latinBlocks) {
      const iso = parseDateToken(b.text);
      if (iso) {
        result.date_naissance = { value: iso, confidence: b.confidence || 0.75 };
        break;
      }
    }
  }

  // "Valable jusqu'au DD.MM.YYYY"
  for (const b of sorted) {
    const m = b.text.match(/(?:Valable|jusqu|صالحة)[^0-9]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i);
    if (m) {
      const iso = parseDateToken(m[1]);
      if (iso) result.date_expiration = { value: iso, confidence: b.confidence || 0.85 };
    }
  }

  return result;
}

/* ── Verso text analysis ────────────────────────────── */

function extractVersoFields(blocks) {
  const result = {};

  for (const b of blocks) {
    const t = b.text || '';

    // Sexe: "Sexe F" or "Sexe M"
    const sexeM = t.match(/\bSexe\s+([MF])\b/i);
    if (sexeM) {
      result.sexe = { value: sexeM[1].toUpperCase(), confidence: b.confidence || 0.9 };
    }
    // Standalone sexe block
    if (/^\s*[MF]\s*$/.test(t) && !result.sexe) {
      // Check if previous block was "Sexe"
      result._maybeSexe = t.trim().toUpperCase();
    }
    if (/\bSexe\b/i.test(t) && !sexeM && result._maybeSexe) {
      result.sexe = { value: result._maybeSexe, confidence: 0.85 };
    }

    // Adresse: "Adresse ..." 
    const addrM = t.match(/\bAdresse\s+(.+)/i);
    if (addrM) {
      const addr = addrM[1].trim();
      if (addr.length >= 5) {
        result.adresse = { value: addr, confidence: b.confidence || 0.82 };
      }
    }

    // CIN from verso (often at top)
    if (!result.cin) {
      const cinText = t.replace(/^(N[°O.]?|رقم|NUM|NO)\s*/i, '').replace(/\s/g, '');
      const cin = normalizeCin(cinText);
      if (isValidCin(cin)) {
        result.cin = { value: cin, confidence: b.confidence || 0.8 };
      }
    }

    // "Valable jusqu'au DD.MM.YYYY"
    const expM = t.match(/(?:Valable|jusqu|صالحة)[^0-9]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i);
    if (expM && !result.date_expiration) {
      const iso = parseDateToken(expM[1]);
      if (iso) result.date_expiration = { value: iso, confidence: b.confidence || 0.85 };
    }

    // N° état civil line — date extraction
    const dateLine = t.match(/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/);
    if (dateLine && !result.date_expiration && /valable|jusqu|صالحة/i.test(t)) {
      const iso = parseDateToken(dateLine[1]);
      if (iso) result.date_expiration = { value: iso, confidence: b.confidence || 0.78 };
    }
  }

  // Handle sexe from separate blocks: look for block "Sexe" followed by block "F" or "M"
  if (!result.sexe) {
    for (let i = 0; i < blocks.length; i++) {
      if (/^\s*Sexe\s*$/i.test(blocks[i].text)) {
        for (let j = i + 1; j < Math.min(i + 3, blocks.length); j++) {
          const t = blocks[j].text.trim();
          if (/^[MF]$/i.test(t)) {
            result.sexe = { value: t.toUpperCase(), confidence: 0.85 };
            break;
          }
        }
        break;
      }
    }
  }

  // Nationality from fullText patterns
  const blob = blocks.map((b) => b.text).join('\n');
  if (/مغرب|MAROCAINE|MAR/i.test(blob)) {
    result.nationalite = { value: 'Marocaine', confidence: 0.82 };
  }

  delete result._maybeSexe;
  return result;
}

/* ── CIN from fullText sweep (fallback) ────────────── */

function extractCinFromText(fullText) {
  const candidates = [];
  for (const line of String(fullText || '').split(/\n+/)) {
    if (isMrzLike(line)) continue;
    const cleaned = line.replace(/^(N[°O.]?|NO|NUM|رقم)\s*/i, '');
    const re = /\b([A-Z]{1,2}\s*\d{4,7})\b/gi;
    let m;
    while ((m = re.exec(cleaned))) {
      const cin = normalizeCin(m[1]);
      if (isValidCin(cin)) candidates.push(cin);
    }
  }
  if (!candidates.length) return null;
  // Most frequent
  const counts = {};
  for (const c of candidates) counts[c] = (counts[c] || 0) + 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { value: best[0], confidence: best[1] >= 2 ? 0.95 : 0.8 };
}

/* ── Main parse function ───────────────────────────── */

function parseCnieFromVision(frontResult, backResult) {
  const frontBlocks = collectLines(frontResult, 'front');
  const backBlocks = collectLines(backResult, 'back');
  const fullText = `${frontResult?.fullText || ''}\n${backResult?.fullText || ''}`;

  // 1. MRZ (highest priority for names, dates, sex)
  const mrz = extractMRZ(backResult?.fullText || '');

  // 2. Recto labels + bboxes
  const recto = frontBlocks.length > 0 ? extractRectoFields(frontBlocks) : {};

  // 3. Verso labels
  const verso = backBlocks.length > 0 ? extractVersoFields(backBlocks) : {};

  // 4. CIN from text sweep
  const cinText = extractCinFromText(fullText);

  // ── Merge with priority: MRZ > recto labels > verso labels > text sweep ──

  const cinValue = mrz?.cin_mrz || recto.cin?.value || verso.cin?.value || cinText?.value || null;
  const cinConf = cinValue
    ? (cinValue === mrz?.cin_mrz ? 0.75 : (recto.cin?.confidence || verso.cin?.confidence || cinText?.confidence || 0.7))
    : 0;
  // MRZ CIN is the document number, not always the CIN printed on card — prefer recto/verso CIN
  const finalCin = recto.cin?.value || verso.cin?.value || cinText?.value || null;
  const finalCinConf = finalCin ? (recto.cin?.confidence || verso.cin?.confidence || cinText?.confidence || 0.75) : 0;

  // Names: MRZ > recto labels
  const nom = mrz?.nom
    ? makeField(mrz.nom, 0.92, 'mrz', false, { fromVision: true })
    : recto.nom
      ? makeField(recto.nom.value, recto.nom.confidence, 'recto_vision', true, { fromVision: true })
      : emptyField();

  const prenom = mrz?.prenom
    ? makeField(mrz.prenom, 0.92, 'mrz', false, { fromVision: true })
    : recto.prenom
      ? makeField(recto.prenom.value, recto.prenom.confidence, 'recto_vision', true, { fromVision: true })
      : emptyField();

  // Dates: MRZ > recto > verso
  const dateNaissance = mrz?.date_naissance
    ? makeField(mrz.date_naissance, 0.90, 'mrz', false, { fromVision: true })
    : recto.date_naissance
      ? makeField(recto.date_naissance.value, recto.date_naissance.confidence, 'recto_vision', true, { fromVision: true })
      : emptyField();

  const dateExpiration = mrz?.date_expiration
    ? makeField(mrz.date_expiration, 0.90, 'mrz', false, { fromVision: true })
    : (recto.date_expiration || verso.date_expiration)
      ? makeField(
          (recto.date_expiration || verso.date_expiration).value,
          (recto.date_expiration || verso.date_expiration).confidence,
          'vision', true, { fromVision: true },
        )
      : emptyField();

  // Sexe: MRZ > verso label > recto
  const sexe = mrz?.sexe
    ? makeField(mrz.sexe, 0.92, 'mrz', false, { fromVision: true })
    : verso.sexe
      ? makeField(verso.sexe.value, verso.sexe.confidence, 'verso_vision', true, { fromVision: true })
      : emptyField();

  // Nationalité: MRZ > verso > generic
  const nationalite = mrz?.nationalite
    ? makeField(mrz.nationalite, 0.88, 'mrz', false)
    : verso.nationalite
      ? makeField(verso.nationalite.value, verso.nationalite.confidence, 'verso_vision', true)
      : /مغرب|MAROCAINE/i.test(fullText)
        ? makeField('Marocaine', 0.80, 'google_vision', true)
        : emptyField();

  // Lieu de naissance: recto "à CITY" label
  const lieuNaissance = recto.lieu_naissance
    ? makeField(recto.lieu_naissance.value, recto.lieu_naissance.confidence, 'recto_vision', true, { fromVision: true })
    : extractLieuFromText(fullText);

  // Adresse: verso
  const adresse = verso.adresse
    ? makeField(verso.adresse.value, verso.adresse.confidence, 'verso_vision', true, { fromVision: true })
    : emptyField();

  const fields = {
    cin: finalCin ? makeField(finalCin, finalCinConf, 'vision', finalCinConf < 0.90, { fromVision: true }) : emptyField(),
    nom,
    prenom,
    date_naissance: dateNaissance,
    date_expiration: dateExpiration,
    sexe,
    nationalite,
    lieu_naissance: lieuNaissance,
    autorite: emptyField(),
    adresse,
    date_delivrance: emptyField(),
    nom_arabe: emptyField(),
    prenom_arabe: emptyField(),
  };

  return fields;
}

function extractLieuFromText(fullText) {
  // "à CITY_NAME" pattern
  const m = String(fullText || '').match(/[àa]\s+([A-Z][A-Za-zÀ-ÿ ]+)/m);
  if (m && m[1].trim().length >= 3 && !isHeader(m[1])) {
    return makeField(m[1].trim().toUpperCase(), 0.75, 'fulltext_vision', true);
  }
  // Known cities
  const cities = ['CASABLANCA', 'RABAT', 'FES', 'MARRAKECH', 'TANGER', 'AGADIR', 'MEKNES', 'OUJDA', 'KENITRA', 'TETOUAN', 'SALE', 'TEMARA', 'MOHAMMEDIA', 'NADOR', 'SETTAT', 'EL JADIDA', 'SAFI', 'KHOURIBGA', 'BENI MELLAL'];
  const upper = String(fullText || '').toUpperCase();
  for (const city of cities) {
    if (upper.includes(city)) {
      return makeField(city, 0.68, 'city_match', true);
    }
  }
  return emptyField();
}

function toWorkerForm(fields, minConf = 0.55) {
  const pick = (key) => {
    const f = fields[key];
    if (!f || !f.valid || !f.value) return null;
    if (Number(f.confidence) < minConf) return null;
    return f.value;
  };
  return {
    cin: pick('cin'),
    nom: pick('nom'),
    prenom: pick('prenom'),
    date_naissance: pick('date_naissance'),
    ville_naissance: pick('lieu_naissance'),
    nationalite: pick('nationalite'),
    sexe: pick('sexe'),
    date_expiration: pick('date_expiration'),
    autorite: pick('autorite'),
    nom_arabe: pick('nom_arabe'),
    prenom_arabe: pick('prenom_arabe'),
    adresse: pick('adresse'),
  };
}

function globalConfidenceLabel(fields) {
  const crit = ['cin', 'nom', 'prenom', 'date_naissance'];
  const ok = crit.filter((k) => fields[k]?.valid && fields[k]?.value).length;
  if (ok >= 4) return 'haute';
  if (ok >= 2) return 'moyenne';
  return 'faible';
}

function scoreParsedFields(fields) {
  const keys = ['cin', 'nom', 'prenom', 'date_naissance', 'date_expiration', 'sexe', 'lieu_naissance', 'nationalite'];
  return keys.reduce((sum, k) => {
    const f = fields?.[k];
    if (!f?.valid || !f?.value) return sum;
    return sum + (Number(f.confidence) || 0.5);
  }, 0);
}

module.exports = {
  parseCnieFromVision,
  toWorkerForm,
  globalConfidenceLabel,
  scoreParsedFields,
  confidenceLevelFromScore,
  emptyField,
  makeField,
  normalizeCin,
  isValidCin,
  parseDateToken,
};
