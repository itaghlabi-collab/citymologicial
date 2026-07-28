/**
 * Parser CNIE marocaine léger — à partir du texte / blocs Google Vision.
 * Pas d'IA complexe : regex, libellés, positions, validations.
 * Ne jamais inventer une valeur.
 */
'use strict';

const CIN_RE = /\b([A-Z]{1,2}\s*\d{4,7})\b/gi;
const DATE_RE = /\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/g;
const MRZ_HINT = /IDMAR|<{2,}|(?:[A-Z0-9]<){3,}/i;

const LABEL_NOM = /\b(NOM|NAME|اللقب)\b/i;
const LABEL_PRENOM = /\b(PR[EÉ]NOM|GIVEN|الاسم\s*الشخصي)\b/i;
const LABEL_BIRTH = /\b(N[EÉ]E?\s*LE|NAISSANCE|BORN|مزداد|تاريخ)/i;
const LABEL_EXP = /\b(VALABLE|EXPIR|JUSQU|صالحة)/i;
const LABEL_LIEU = /\b(LIEU|PLACE|À|A\s|مكان)/i;
const LABEL_SEXE = /\b(SEXE|SEX|الجنس)\b/i;
const LABEL_NAT = /\b(NATIONALIT[EÉ]|الجنسية)\b/i;
const FILIATION = /\b(FILLE\s+DE|FILS\s+DE|بنت|ابن)\b/i;
const HEADER = /\b(ROYAUME|MAROC|CARTE\s+NATIONALE|IDENTIT[EÉ]|المملكة|البطاقة)\b/i;

const OCR_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

function confidenceLevelFromScore(conf) {
  if (conf >= 0.85) return 'haute';
  if (conf >= 0.70) return 'moyenne';
  return 'faible';
}

function emptyField(source = 'google_vision') {
  return {
    value: null,
    confidence: 0,
    confidence_level: 'faible',
    confidence_from_vision: false,
    valid: false,
    source,
    requires_manual_review: true,
  };
}

/**
 * @param {string|null} value
 * @param {number} confidence
 * @param {string} source
 * @param {boolean} review
 * @param {{ fromVision?: boolean }} opts
 */
function makeField(value, confidence, source = 'google_vision', review = false, opts = {}) {
  if (value == null || String(value).trim() === '') return emptyField(source);
  const conf = Math.max(0, Math.min(1, Number(confidence) || 0));
  const fromVision = opts.fromVision === true;
  return {
    value: String(value).trim(),
    confidence: conf,
    confidence_level: confidenceLevelFromScore(conf),
    // % UI uniquement si confiance mot/bloc Vision réelle
    confidence_from_vision: fromVision,
    valid: conf >= 0.45,
    source,
    requires_manual_review: review || conf < 0.85,
  };
}

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(s) {
  return stripAccents(s).replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeCin(raw) {
  let s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z]{1,2})([A-Z0-9]+)$/);
  if (!m) return s;
  const head = m[1];
  const rest = m[2]
    .split('')
    .map((c) => OCR_DIGIT[c] || c)
    .join('')
    .replace(/\D/g, '');
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
  const t = String(text || '');
  if (MRZ_HINT.test(t)) return true;
  const compact = t.replace(/\s+/g, '');
  return compact.length >= 20 && /^[A-Z0-9<]+$/.test(compact);
}

function collectBlocks(frontResult, backResult) {
  const out = [];
  for (const b of frontResult?.blocks || []) {
    out.push({ ...b, side: 'front', text: b.text || '', normalized: normText(b.text) });
  }
  for (const b of backResult?.blocks || []) {
    out.push({ ...b, side: 'back', text: b.text || '', normalized: normText(b.text) });
  }
  // lignes du fullText
  for (const [side, res] of [['front', frontResult], ['back', backResult]]) {
    const lines = String(res?.fullText || '').split(/\n+/);
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      out.push({
        text: t,
        normalized: normText(t),
        confidence: 0.75,
        bbox: null,
        side,
        fromFullText: true,
      });
    }
  }
  return out;
}

function extractCin(blocks, fullText) {
  const candidates = [];
  const push = (raw, conf, src) => {
    if (isMrzLike(raw)) return;
    const v = normalizeCin(raw);
    if (!isValidCin(v)) return;
    candidates.push({ value: v, confidence: conf, source: src });
  };

  for (const b of blocks) {
    if (isMrzLike(b.text)) continue;
    const cleaned = String(b.text || '').replace(/^(N[°O.]?|NO|NUM)\s*/i, '');
    let m;
    const re = new RegExp(CIN_RE.source, 'gi');
    while ((m = re.exec(cleaned))) {
      push(m[1], Math.max(0.7, b.confidence || 0.7), `${b.side}_vision`);
    }
  }
  // full text sweep (hors MRZ lines)
  for (const line of String(fullText || '').split(/\n+/)) {
    if (isMrzLike(line)) continue;
    let m;
    const re = new RegExp(CIN_RE.source, 'gi');
    while ((m = re.exec(line))) {
      push(m[1], 0.72, 'fulltext_vision');
    }
  }

  if (!candidates.length) return emptyField();
  candidates.sort((a, b) => b.confidence - a.confidence || b.value.length - a.value.length);
  const top = candidates[0];
  const multi = candidates.filter((c) => c.value === top.value).length >= 2;
  return makeField(top.value, multi ? Math.min(0.98, top.confidence + 0.1) : top.confidence, top.source, !multi);
}

function extractDates(blocks, fullText) {
  const found = [];
  const consider = (text, conf, side) => {
    let m;
    const re = new RegExp(DATE_RE.source, 'g');
    while ((m = re.exec(text))) {
      const iso = parseDateToken(m[0]);
      if (!iso) continue;
      found.push({
        iso,
        confidence: conf,
        side,
        ctx: normText(text),
      });
    }
  };
  for (const b of blocks) {
    if (isMrzLike(b.text)) continue;
    consider(b.text, Math.max(0.65, b.confidence || 0.7), b.side);
  }
  consider(fullText || '', 0.6, 'both');

  let birth = null;
  let exp = null;
  for (const f of found) {
    const birthHint = LABEL_BIRTH.test(f.ctx);
    const expHint = LABEL_EXP.test(f.ctx);
    if (birthHint && !birth) birth = f;
    else if (expHint && !exp) exp = f;
  }
  // chronologie : naissance = plus ancienne, expiration = plus récente
  const unique = [...new Map(found.map((f) => [f.iso, f])).values()].sort((a, b) => a.iso.localeCompare(b.iso));
  if (!birth && unique[0]) birth = unique[0];
  if (!exp && unique.length >= 2) exp = unique[unique.length - 1];
  if (birth && exp && birth.iso === exp.iso) {
    exp = unique.find((u) => u.iso !== birth.iso) || null;
  }
  if (birth && exp && exp.iso <= birth.iso) {
    exp = null;
  }

  return {
    date_naissance: birth
      ? makeField(birth.iso, birth.confidence + (LABEL_BIRTH.test(birth.ctx) ? 0.1 : 0), `${birth.side}_vision`, true)
      : emptyField(),
    date_expiration: exp
      ? makeField(exp.iso, exp.confidence + (LABEL_EXP.test(exp.ctx) ? 0.1 : 0), `${exp.side}_vision`, true)
      : emptyField(),
  };
}

function valueAfterLabel(blocks, labelRe, side = 'front') {
  const list = blocks.filter((b) => b.side === side && !b.fromFullText);
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i].text || '';
    if (!labelRe.test(t)) continue;
    const rest = t.replace(labelRe, '').replace(/[:：]/g, '').trim();
    if (rest && !HEADER.test(rest) && !FILIATION.test(rest) && rest.length >= 2) {
      return { value: rest, confidence: Math.max(0.75, list[i].confidence || 0.75) };
    }
    for (let j = i + 1; j < Math.min(i + 3, list.length); j += 1) {
      const n = (list[j].text || '').trim();
      if (!n || HEADER.test(n) || labelRe.test(n) || FILIATION.test(n)) continue;
      if (/^\d/.test(n) && !/[A-Za-zÀ-ÿ]/.test(n)) continue;
      return { value: n, confidence: Math.max(0.72, list[j].confidence || 0.72) };
    }
  }
  return null;
}

function isPlausibleName(s) {
  const t = String(s || '').trim();
  if (t.length < 2 || t.length > 45) return false;
  if (HEADER.test(t) || FILIATION.test(t) || isMrzLike(t)) return false;
  if (/\d/.test(t)) return false;
  // latin et/ou arabe
  return /[A-Za-zÀ-ÿ\u0600-\u06FF]/.test(t);
}

function extractNames(blocks) {
  const nomHit = valueAfterLabel(blocks, LABEL_NOM, 'front');
  const preHit = valueAfterLabel(blocks, LABEL_PRENOM, 'front');
  let nom = nomHit && isPlausibleName(nomHit.value)
    ? makeField(nomHit.value.toUpperCase(), nomHit.confidence, 'label_nom', true)
    : emptyField();
  let prenom = preHit && isPlausibleName(preHit.value)
    ? makeField(preHit.value.toUpperCase(), preHit.confidence, 'label_prenom', true)
    : emptyField();

  if (!nom.value || !prenom.value) {
    const front = blocks
      .filter((b) => b.side === 'front' && !b.fromFullText && isPlausibleName(b.text))
      .filter((b) => !LABEL_NOM.test(b.text) && !LABEL_PRENOM.test(b.text) && !LABEL_BIRTH.test(b.text))
      .map((b) => ({
        value: String(b.text).trim().toUpperCase(),
        confidence: b.confidence || 0.7,
        y: Array.isArray(b.bbox) ? b.bbox[1] : 0,
        len: String(b.text).trim().length,
      }))
      .filter((x) => x.len >= 3 && x.len <= 18);

    front.sort((a, b) => b.confidence - a.confidence || b.len - a.len);
    const picked = [];
    const seen = new Set();
    for (const f of front) {
      if (seen.has(f.value)) continue;
      seen.add(f.value);
      picked.push(f);
      if (picked.length >= 2) break;
    }
    picked.sort((a, b) => a.y - b.y);
    if (!prenom.value && picked[0]) {
      prenom = makeField(picked[0].value, picked[0].confidence * 0.85, 'front_vision', true);
    }
    if (!nom.value && picked[1]) {
      nom = makeField(picked[1].value, picked[1].confidence * 0.85, 'front_vision', true);
    }
  }

  if (nom.value && prenom.value && nom.value === prenom.value) {
    nom.requires_manual_review = true;
    prenom.requires_manual_review = true;
    nom.confidence = Math.min(nom.confidence, 0.4);
    prenom.confidence = Math.min(prenom.confidence, 0.4);
  }
  return { nom, prenom };
}

function extractSexe(blocks, fullText) {
  const blob = `${blocks.map((b) => b.text).join('\n')}\n${fullText || ''}`;
  if (/\b(F|FEM|FEMME|أنثى)\b/i.test(blob) || /أنث/.test(blob)) {
    return makeField('F', 0.8, 'google_vision', true);
  }
  if (/\b(M|MASC|HOMME|ذكر)\b/i.test(blob)) {
    return makeField('M', 0.8, 'google_vision', true);
  }
  // libellé Sexe suivi d'une lettre
  for (const b of blocks) {
    if (!LABEL_SEXE.test(b.text || '')) continue;
    const m = String(b.text).match(/\b([MF])\b/i);
    if (m) return makeField(m[1].toUpperCase(), 0.85, 'label_sexe', false);
  }
  return emptyField();
}

function extractNationalite(blocks, fullText) {
  const blob = `${blocks.map((b) => b.text).join('\n')}\n${fullText || ''}`;
  if (/مغرب|MAROCAINE|MAROCCAN|NATIONALITE\s*MAROCAINE|\bMAR\b/i.test(blob)) {
    return makeField('Marocaine', 0.82, 'google_vision', true);
  }
  const hit = valueAfterLabel(blocks, LABEL_NAT, 'front') || valueAfterLabel(blocks, LABEL_NAT, 'back');
  if (hit && hit.value.length > 2 && !/^A$/i.test(hit.value)) {
    return makeField(hit.value, hit.confidence, 'label_nationalite', true);
  }
  return emptyField();
}

function extractLieu(blocks) {
  const front = blocks.filter((b) => b.side === 'front');
  // sous libellé naissance / lieu
  for (let i = 0; i < front.length; i += 1) {
    const t = front[i].text || '';
    if (!(LABEL_LIEU.test(t) || LABEL_BIRTH.test(t))) continue;
    const rest = t
      .replace(LABEL_BIRTH, ' ')
      .replace(LABEL_LIEU, ' ')
      .replace(/\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/g, ' ')
      .replace(/[:：]/g, ' ')
      .trim();
    if (rest.length >= 3 && /[A-Za-zÀ-ÿ\u0600-\u06FF]/.test(rest) && !isMrzLike(rest)) {
      return makeField(normText(rest), 0.78, 'label_lieu', true);
    }
    for (let j = i + 1; j < Math.min(i + 3, front.length); j += 1) {
      const n = (front[j].text || '').trim();
      if (n.length < 3 || HEADER.test(n) || FILIATION.test(n) || isMrzLike(n)) continue;
      if (/^\d/.test(n) && !/[A-Za-zÀ-ÿ]/.test(n)) continue;
      if (DATE_RE.test(n)) continue;
      return makeField(normText(n), 0.76, 'below_lieu', true);
    }
  }
  // ligne contenant une ville connue
  const cities = ['CASABLANCA', 'RABAT', 'FES', 'MARRAKECH', 'TANGER', 'AGADIR', 'MEKNES', 'OUJDA', 'KENITRA', 'TETOUAN', 'SALE', 'TEMARA', 'MOHAMMEDIA'];
  for (const b of front) {
    const n = b.normalized || normText(b.text);
    if (cities.some((c) => n.includes(c)) && n.length >= 5 && !isMrzLike(n)) {
      return makeField(n, 0.7, 'front_vision', true);
    }
  }
  return emptyField();
}

function extractAdresse(blocks) {
  const back = blocks.filter((x) => x.side === 'back');
  for (let i = 0; i < back.length; i += 1) {
    const t = back[i].text || '';
    if (!/ADRESSE|العنوان/i.test(t)) continue;
    let rest = t.replace(/^.*(?:ADRESSE|العنوان)\s*[:：]?\s*/i, '').trim();
    if (rest.length < 5) {
      for (let j = i + 1; j < Math.min(i + 3, back.length); j += 1) {
        const n = (back[j].text || '').trim();
        if (n.length < 5 || isMrzLike(n) || HEADER.test(n) || /SEXE|NATIONALIT|VALABLE|FILLE|FILS|ÉTAT|ETAT/i.test(n)) continue;
        rest = n;
        break;
      }
    }
    if (rest.length >= 5 && !isMrzLike(rest)) {
      // retirer préfixe arabe collé si latin présent
      const latin = rest.match(/[A-Za-zÀ-ÿ].*$/);
      const value = latin && latin[0].length >= 5 ? latin[0].trim() : rest;
      const conf = Math.max(0.72, Number(back[i].confidence) || 0.72);
      return makeField(value, conf, 'back_adresse', true, {
        fromVision: typeof back[i].confidence === 'number' && back[i].confidence > 0,
      });
    }
  }
  return emptyField();
}

function extractAutorite(blocks) {
  const back = blocks.filter((x) => x.side === 'back');
  for (let i = 0; i < back.length; i += 1) {
    const t = back[i].text || '';
    if (!/AUTORIT|ولاية|PREFECTURE|الولاية|WILAYA|PACHA/i.test(t)) continue;
    const rest = t.replace(/.*(?:AUTORIT\w*|الولاية|PREFECTURE|WILAYA|PACHA)\s*[:：]?\s*/i, '').trim();
    if (rest.length >= 3 && !isMrzLike(rest) && !HEADER.test(rest)) {
      const conf = Math.max(0.7, Number(back[i].confidence) || 0.7);
      return makeField(rest, conf, 'back_vision', true, {
        fromVision: typeof back[i].confidence === 'number' && back[i].confidence > 0,
      });
    }
    for (let j = i + 1; j < Math.min(i + 3, back.length); j += 1) {
      const n = (back[j].text || '').trim();
      if (n.length < 3 || HEADER.test(n) || isMrzLike(n) || /^\d{1,2}[./\-]/.test(n)) continue;
      if (/NATIONALIT|SEXE|VALABLE|ADRESSE/i.test(n)) continue;
      const conf = Math.max(0.68, Number(back[j].confidence) || 0.68);
      return makeField(n, conf, 'below_autorite', true, {
        fromVision: typeof back[j].confidence === 'number' && back[j].confidence > 0,
      });
    }
  }
  return emptyField();
}

/** Score heuristique pour comparer recto/verso (éventuellement inversés). */
function scoreParsedFields(fields) {
  const keys = ['cin', 'nom', 'prenom', 'date_naissance', 'date_expiration', 'sexe', 'lieu_naissance', 'nationalite'];
  return keys.reduce((sum, k) => {
    const f = fields?.[k];
    if (!f?.valid || !f?.value) return sum;
    return sum + (Number(f.confidence) || 0.5);
  }, 0);
}

/**
 * @param {{ fullText: string, blocks: Array }} frontResult
 * @param {{ fullText: string, blocks: Array }} backResult
 */
function parseCnieFromVision(frontResult, backResult) {
  const blocks = collectBlocks(frontResult, backResult);
  const fullText = `${frontResult?.fullText || ''}\n${backResult?.fullText || ''}`;

  const cin = extractCin(blocks, fullText);
  const { nom, prenom } = extractNames(blocks);
  const dates = extractDates(blocks, fullText);
  const sexe = extractSexe(blocks, fullText);
  const nationalite = extractNationalite(blocks, fullText);
  const lieu_naissance = extractLieu(blocks);
  const autorite = extractAutorite(blocks);
  const adresse = extractAdresse(blocks);

  const fields = {
    cin,
    nom,
    prenom,
    date_naissance: dates.date_naissance,
    date_expiration: dates.date_expiration,
    sexe,
    nationalite,
    lieu_naissance,
    autorite,
    adresse,
    date_delivrance: emptyField(),
    nom_arabe: emptyField(),
    prenom_arabe: emptyField(),
  };

  return fields;
}

function toWorkerForm(fields, minConf = 0.7) {
  const pick = (key, alias) => {
    const f = fields[key];
    if (!f || !f.valid || !f.value) return null;
    if (f.requires_manual_review && f.confidence < 0.85) {
      // toujours proposer si confidence >= minConf (suggestion)
    }
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
