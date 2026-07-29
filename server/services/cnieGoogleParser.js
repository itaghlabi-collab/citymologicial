/**
 * Parser CNIE marocaine — Google Vision → champs structurés.
 *
 * Stateless et générique : chaque appel ne dépend que des images / textes fournis.
 * Aucune CNIE d'exemple, aucun cache inter-analyses, aucune donnée codée en dur.
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

/**
 * Normalise un CIN uniquement si le raw a déjà un préfixe lettres + chiffres.
 * Ne convertit JAMAIS un nom tout-lettres en CIN (pas de mapping OCR lettres→chiffres sur un mot).
 */
function normalizeCin(raw, { applyOcrFixes = false } = {}) {
  const s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z]{1,3})(\d[A-Z0-9]*)$/);
  if (!m) return '';
  const head = m[1];
  let rest = m[2];
  if (applyOcrFixes) {
    rest = rest.split('').map((c) => (/\d/.test(c) ? c : (OCR_DIGIT[c] || ''))).join('');
  } else {
    rest = rest.replace(/\D/g, '');
  }
  if (!rest || rest.length < 4) return '';
  return head + rest;
}

function isValidCin(v) {
  return /^[A-Z]{1,3}\d{4,8}$/.test(v) && v.length >= 5 && v.length <= 11;
}

/** Rejette les faux positifs techniques / noms / CAN vertical. */
function isRejectedCinCandidate(raw, normalized) {
  const s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!normalized || !isValidCin(normalized)) return true;
  // Tout-lettres d'origine = nom / libellé, jamais un CIN
  if (/^[A-Z]+$/.test(s)) return true;
  // Préfixe CAN (numéro vertical technique sur le bord)
  if (/^CAN/i.test(s) || /^CAN\d/i.test(normalized)) return true;
  // Trop de 0/1 → souvent artefact OCR / numéro technique
  const digits = normalized.replace(/^[A-Z]+/, '');
  const zeroOne = (digits.match(/[01]/g) || []).length;
  if (digits.length >= 5 && zeroOne / digits.length >= 0.85) return true;
  // Doc number MRZ (lettres mélangées au milieu) — pas un CIN imprimé
  if (/[A-Z]/.test(s.replace(/^[A-Z]{1,3}/, ''))) return true;
  return false;
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

  // L1 TD1: ID + MAR + documentNumber(9) + check + optionalData
  // Sur CNIE marocaine, le CIN imprimé est souvent dans optionalData (après le check),
  // pas dans le documentNumber technique MRZ.
  const optional = l1.slice(15).replace(/</g, ' ');
  const cinInOptional = optional.match(/\b([A-Z]{1,3}\d{4,8})\b/);
  if (cinInOptional) {
    const cin = normalizeCin(cinInOptional[1]);
    if (isValidCin(cin) && !isRejectedCinCandidate(cinInOptional[1], cin)) {
      result.cin_mrz = cin;
    }
  }
  // Doc number technique — jamais utilisé seul comme CIN
  const docRaw = l1.slice(5, 14).replace(/</g, '');
  if (docRaw.length >= 5) result.doc_number_mrz = docRaw;

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

  // CIN : géré exclusivement par selectCin() (bbox + MRZ + croisement)

  // Find names from Latin labels in left half
  // Strategy: look for blocks that are purely Latin names (no labels, no dates)
  const nameBlocks = latinBlocks.filter((b) => {
    const t = b.text.trim();
    if (!isLatinName(t)) return false;
    if (/^(No|Née?\s+le|Valable|CIN|Sexe|N°|NOM|PRENOM|PRÉNOM|NAME)$/i.test(t)) return false;
    if (/^[A-Z]{1}$/i.test(t)) return false;
    // Ne pas traiter un CIN-like comme nom
    if (isValidCin(normalizeCin(t))) return false;
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

    // CIN verso : géré par selectCin()

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

/* ── CIN : candidats + scoring + validation croisée ── */

const CIN_TOKEN_RE = /\b([A-Z]{1,3}\s*\d{4,8})\b/gi;

function pushCinCandidate(list, raw, meta) {
  const value = normalizeCin(raw);
  if (isRejectedCinCandidate(raw, value)) return;
  list.push({
    value,
    raw: String(raw || '').replace(/\s/g, '').toUpperCase(),
    source: meta.source,
    nearLabel: !!meta.nearLabel,
    vertical: !!meta.vertical,
    bottomLeft: !!meta.bottomLeft,
    confidence: Number(meta.confidence) || 0.7,
  });
}

function collectCinCandidates(frontBlocks, backBlocks, frontFullText, backFullText, mrz) {
  const list = [];
  const imgW = Math.max(1, ...frontBlocks.map((b) => b.bbox[2] || 0));
  const imgH = Math.max(1, ...frontBlocks.map((b) => b.bbox[3] || 0));

  for (const b of frontBlocks) {
    if (isMrzLike(b.text)) continue;
    const [x0, y0, x1, y1] = b.bbox;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const vertical = cx > imgW * 0.78 || ((y1 - y0) > (x1 - x0) * 1.6 && cx > imgW * 0.7);
    const bottomLeft = cy > imgH * 0.65 && cx < imgW * 0.5;
    const nearLabel = /N[°ºo.]|Nº|\bCIN\b|CARTE\s*NATIONALE|NUM/i.test(b.text)
      || (bottomLeft && /^(N[°ºo.]?|NO)\b/i.test(String(b.text).trim()));

    // Bloc voisin d'un label N° (bloc précédent)
    let labelNearby = nearLabel;
    // aussi scanner le texte
    let m;
    const re = new RegExp(CIN_TOKEN_RE.source, 'gi');
    while ((m = re.exec(b.text))) {
      pushCinCandidate(list, m[1], {
        source: 'recto',
        nearLabel: labelNearby || /N[°ºo.]|Nº|\bCIN\b/i.test(b.text),
        vertical,
        bottomLeft,
        confidence: b.confidence,
      });
    }
  }

  // Label N° seul suivi d'un bloc CIN bas-gauche
  for (let i = 0; i < frontBlocks.length; i += 1) {
    const b = frontBlocks[i];
    if (!/^(N[°ºo.]?|NO|Nº|CIN)\s*$/i.test(String(b.text || '').trim())) continue;
    for (let j = i + 1; j < Math.min(i + 4, frontBlocks.length); j += 1) {
      const n = frontBlocks[j];
      const cx = (n.bbox[0] + n.bbox[2]) / 2;
      if (cx > imgW * 0.78) continue;
      const m = String(n.text || '').match(/([A-Z]{1,3}\s*\d{4,8})/i);
      if (m) {
        pushCinCandidate(list, m[1], {
          source: 'recto',
          nearLabel: true,
          vertical: false,
          bottomLeft: true,
          confidence: Math.max(n.confidence || 0.8, 0.9),
        });
      }
    }
  }

  for (const b of backBlocks) {
    if (isMrzLike(b.text)) continue;
    const nearLabel = /N[°ºo.]|رقم|CIN|NUM/i.test(b.text);
    let m;
    const re = new RegExp(CIN_TOKEN_RE.source, 'gi');
    while ((m = re.exec(b.text))) {
      pushCinCandidate(list, m[1], {
        source: 'verso',
        nearLabel,
        vertical: false,
        bottomLeft: false,
        confidence: b.confidence,
      });
    }
  }

  if (mrz?.cin_mrz) {
    pushCinCandidate(list, mrz.cin_mrz, {
      source: 'mrz',
      nearLabel: false,
      vertical: false,
      bottomLeft: false,
      confidence: 0.88,
    });
  }

  // Regex globale last resort (hors MRZ)
  for (const [side, text] of [['recto', frontFullText], ['verso', backFullText]]) {
    for (const line of String(text || '').split(/\n+/)) {
      if (isMrzLike(line)) continue;
      let m;
      const re = new RegExp(CIN_TOKEN_RE.source, 'gi');
      while ((m = re.exec(line))) {
        pushCinCandidate(list, m[1], {
          source: 'regex',
          nearLabel: false,
          vertical: false,
          bottomLeft: false,
          confidence: 0.55,
        });
      }
    }
  }

  return list;
}

/** Distance OCR prudente (O/0, I/1, B/8, S/5) — uniquement pour croiser 2 sources. */
function cinOcrDistance(a, b) {
  const x = String(a || '').toUpperCase();
  const y = String(b || '').toUpperCase();
  if (x.length !== y.length) return Infinity;
  const map = { O: '0', '0': 'O', I: '1', '1': 'I', B: '8', '8': 'B', S: '5', '5': 'S' };
  let d = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] === y[i]) continue;
    if (map[x[i]] === y[i]) { d += 1; continue; }
    return Infinity;
  }
  return d;
}

/**
 * Si deux sources indépendantes ne diffèrent que par confusions OCR,
 * unifier vers la valeur la mieux ancrée (recto près de N° > verso > mrz).
 */
function unifyOcrCrossMatches(candidates) {
  const out = [...candidates];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.value === b.value) continue;
      if (a.source === b.source) continue; // sources indépendantes uniquement
      if (a.vertical || b.vertical) continue;
      const d = cinOcrDistance(a.value, b.value);
      if (d < 1 || d > 2) continue;
      // Préférer ancrage recto/nearLabel
      const preferA = (a.source === 'recto' && a.nearLabel)
        || (a.source === 'recto' && b.source !== 'recto')
        || (a.source === 'verso' && b.source === 'mrz');
      const canon = preferA ? a.value : b.value;
      out.push({
        ...a,
        value: canon,
        source: a.source,
        confidence: Math.max(a.confidence, b.confidence),
      });
      out.push({
        ...b,
        value: canon,
        source: b.source,
        confidence: Math.max(a.confidence, b.confidence),
      });
    }
  }
  return out;
}

function scoreCinCandidate(c, all) {
  let score = 0;
  if (c.vertical) return -100; // JAMAIS le CAN vertical
  if (c.source === 'recto' && c.nearLabel) score += 50;
  if (c.source === 'recto' && c.bottomLeft) score += 35;
  if (c.source === 'recto') score += 20;
  if (c.source === 'verso' && c.nearLabel) score += 30;
  if (c.source === 'verso') score += 15;
  if (c.source === 'mrz') score += 25; // utile seulement en croisement
  if (c.source === 'regex') score += 5;

  const same = all.filter((x) => x.value === c.value && !x.vertical);
  const sources = new Set(same.map((x) => x.source));
  if (sources.has('recto') && sources.has('mrz')) score += 60;
  if (sources.has('recto') && sources.has('verso')) score += 45;
  if (sources.has('verso') && sources.has('mrz')) score += 40;
  if (sources.size >= 2) score += 20;

  score += Math.min(10, (c.confidence || 0) * 10);
  return score;
}

/**
 * Sélection CIN — priorité :
 * 1. Recto près de N° / bas-gauche
 * 2. MRZ si concordante avec autre source
 * 3. Verso haut
 * 4. Regex globale
 */
function selectCin(frontBlocks, backBlocks, frontFullText, backFullText, mrz) {
  const rawCandidates = collectCinCandidates(frontBlocks, backBlocks, frontFullText, backFullText, mrz);
  const candidates = unifyOcrCrossMatches(rawCandidates);
  if (!candidates.length) return emptyField();

  // Agréger par valeur
  const byValue = new Map();
  for (const c of candidates) {
    if (!byValue.has(c.value)) byValue.set(c.value, []);
    byValue.get(c.value).push(c);
  }

  let best = null;
  let bestScore = -Infinity;
  for (const [value, group] of byValue) {
    // Prendre le meilleur représentant du groupe
    const ranked = group
      .map((c) => ({ ...c, score: scoreCinCandidate(c, candidates) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top.score > bestScore) {
      bestScore = top.score;
      const sources = [...new Set(group.map((g) => g.source))];
      best = { value, score: top.score, sources, group };
    }
  }

  if (!best || best.score < 15) {
    // Aucune source contextuelle fiable → ne pas injecter
    return emptyField('cin_unconfirmed');
  }

  const sources = best.sources.filter((s) => s !== 'regex');
  const hasRecto = sources.includes('recto');
  const hasMrz = sources.includes('mrz');
  const hasVerso = sources.includes('verso');
  const concordant = (hasRecto && hasMrz) || (hasRecto && hasVerso) || (hasVerso && hasMrz);

  // MRZ seul sans croisement → pas de confiance haute
  if (sources.length === 1 && sources[0] === 'mrz') {
    return makeField(best.value, 0.55, 'mrz', true, { fromVision: true });
  }
  // Regex seule → à vérifier ou vide si score faible
  if (sources.length === 0 || (sources.length === 1 && best.sources.includes('regex') && !hasRecto && !hasVerso && !hasMrz)) {
    if (best.score < 25) return emptyField('cin_unconfirmed');
    return makeField(best.value, 0.5, 'regex', true, { fromVision: false });
  }

  let conf = 0.7;
  let source = hasRecto ? 'recto' : (hasVerso ? 'verso' : 'mrz');
  let review = true;
  if (concordant) {
    conf = 0.95;
    source = hasRecto && hasMrz ? 'recto+mrz' : (hasRecto && hasVerso ? 'recto+verso' : 'verso+mrz');
    review = false;
  } else if (hasRecto) {
    conf = 0.78;
    review = true;
  } else if (hasVerso) {
    conf = 0.72;
    review = true;
  }

  return makeField(best.value, conf, source, review, { fromVision: true });
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

  // 4. CIN — scoring + croisement (jamais un nom / CAN vertical)
  const cin = selectCin(
    frontBlocks,
    backBlocks,
    frontResult?.fullText || '',
    backResult?.fullText || '',
    mrz,
  );

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
    cin,
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
  isRejectedCinCandidate,
  selectCin,
  collectCinCandidates,
  scoreCinCandidate,
  parseDateToken,
};
