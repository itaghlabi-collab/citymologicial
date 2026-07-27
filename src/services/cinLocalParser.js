/**
 * Parser CIN marocaine côté client (secours si service Python indisponible).
 * Même logique de base que ocr-service/app/parser — sans dépendances lourdes.
 */

const CIN_RE = /\b([A-Z]{1,2}\s?\d{4,7})\b/gi;
const CIN_OCR_RE = /\b([A-Z]{1,2}\s?[0-9]{3,6}[0-9A-Z]{1,2})\b/gi;
const DATE_RE = /\b(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})\b/g;

const OCR_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

function confLabel(score, has) {
  if (!has) return 'non_detecte';
  if (score >= 0.82) return 'elevee';
  if (score >= 0.55) return 'moyenne';
  return 'faible';
}

function field(value, score, candidates = []) {
  const has = Boolean(value);
  return {
    value: has ? value : '',
    confidence: confLabel(score, has),
    confidence_pct: has ? Math.round(Math.min(1, score) * 100) : 0,
    raw: value || '',
    candidates,
  };
}

function toIso(d, m, y) {
  let yy = y;
  if (yy < 100) yy = yy < 40 ? 2000 + yy : 1900 + yy;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && yy >= 1920 && yy <= 2100)) return '';
  return `${String(yy).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateToken(raw) {
  const m = String(raw || '').match(/(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})/);
  if (!m) return '';
  return toIso(+m[1], +m[2], +m[3]) || toIso(+m[2], +m[1], +m[3]) || '';
}

function normalizeCin(raw) {
  let s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z0-9]{1,2})([A-Z0-9]{4,8})$/);
  if (!m) return s;
  let letters = m[1].replace(/\d/g, (c) => ({ 0: 'O', 1: 'I', 8: 'B' }[c] || '')).replace(/[^A-Z]/g, '').slice(0, 2);
  let digits = m[2].split('').map((c) => OCR_DIGIT[c] || c).join('').replace(/\D/g, '');
  if (letters && digits.length >= 4 && digits.length <= 7) return letters + digits;
  return s;
}

function scoreCin(token) {
  const v = normalizeCin(token);
  const m = v.match(/^([A-Z]{1,2})(\d{4,7})$/);
  if (!m) return 0.1;
  let s = 0.55;
  if (m[2].length === 6) s += 0.3;
  else if (m[2].length === 5 || m[2].length === 7) s += 0.18;
  return Math.min(1, s);
}

function pickBestCin(candidates) {
  const scored = [];
  const seen = new Set();
  for (const raw of candidates) {
    const v = normalizeCin(raw);
    if (!v || seen.has(v)) continue;
    if (!/^([A-Z]{1,2})(\d{4,7})$/.test(v)) continue;
    seen.add(v);
    scored.push([v, scoreCin(raw)]);
  }
  scored.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  if (!scored.length) return { value: '', score: 0, ranked: [] };
  return { value: scored[0][0], score: scored[0][1], ranked: scored.map((x) => x[0]) };
}

function collectCins(text) {
  const out = [];
  const t = String(text || '');
  for (const re of [CIN_RE, CIN_OCR_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (/\d/.test(m[1])) out.push(m[1]);
    }
  }
  return out;
}

function collectLabeled(text) {
  const bag = { nom: [], prenom: [], naissance: [], expiration: [], lieu: [], sexe: [] };
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(/^(?:NOM|SURNAM?E)\s*[:.]?\s*(.*)$/i);
    if (m) { bag.nom.push((m[1] || lines[i + 1] || '').toUpperCase()); continue; }
    m = line.match(/^(?:PR[EÉ]NOM|GIVEN\s*NAMES?)\s*[:.]?\s*(.*)$/i);
    if (m) { bag.prenom.push((m[1] || lines[i + 1] || '').toUpperCase()); continue; }
    m = line.match(/(?:N[EÉ][EÉ]?\s*(?:LE|A|À)?|DATE\s*(?:DE\s*)?NAISSANCE)\s*[:.]?\s*(.*)$/i);
    if (m) {
      const d = parseDateToken(m[1] || line);
      if (d) bag.naissance.push(d);
      continue;
    }
    m = line.match(/^(?:A\s+|À\s+|LIEU)/i);
    if (m) {
      const rest = line.replace(/^(?:A|À|LIEU\s*(?:DE\s*)?NAISSANCE)\s*[:.]?\s*/i, '');
      const val = (rest || lines[i + 1] || '').toUpperCase();
      if (val.length > 2) bag.lieu.push(val);
      continue;
    }
    m = line.match(/^(?:SEXE|SEX)\s*[:.]?\s*([MF])/i);
    if (m) { bag.sexe.push(m[1].toUpperCase()); continue; }
    m = line.match(/(?:VALABLE|EXPIR)/i);
    if (m) {
      const d = parseDateToken(line);
      if (d) bag.expiration.push(d);
    }
  }
  // dates génériques
  DATE_RE.lastIndex = 0;
  let dm;
  while ((dm = DATE_RE.exec(text || ''))) {
    const iso = parseDateToken(dm[0]);
    if (!iso) continue;
    if (iso < '2010-01-01') bag.naissance.push(iso);
    else if (iso >= '2015-01-01') bag.expiration.push(iso);
  }
  return bag;
}

function parseMrz(text) {
  const bag = { nom: [], prenom: [], cin: [], naissance: [], expiration: [], sexe: [] };
  const lines = String(text || '').toUpperCase().replace(/ /g, '').split(/\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20 && l.includes('<'));
  if (!lines.length) return bag;
  const nameLine = lines[0];
  if (nameLine.includes('<<')) {
    const body = nameLine.replace(/^I<?[A-Z]{0,3}/, '');
    const parts = body.split('<<');
    if (parts[0]) bag.nom.push(parts[0].replace(/</g, ' ').trim());
    if (parts[1]) bag.prenom.push(parts[1].replace(/</g, ' ').trim());
  }
  if (lines[1]) {
    const data = lines[1];
    const doc = data.replace(/</g, '').match(/^([A-Z]{1,2}\d{4,7})/);
    if (doc) bag.cin.push(doc[1]);
    const dates = data.match(/(\d{6})/g) || [];
    if (dates[0]) {
      const yy = +dates[0].slice(0, 2); const mm = +dates[0].slice(2, 4); const dd = +dates[0].slice(4, 6);
      const iso = toIso(dd, mm, yy < 40 ? 2000 + yy : 1900 + yy);
      if (iso) bag.naissance.push(iso);
    }
    if (dates[1]) {
      const yy = +dates[1].slice(0, 2); const mm = +dates[1].slice(2, 4); const dd = +dates[1].slice(4, 6);
      const iso = toIso(dd, mm, yy < 40 ? 2000 + yy : 1900 + yy);
      if (iso) bag.expiration.push(iso);
    }
    const sex = data.match(/[0-9]([MF])[0-9]/);
    if (sex) bag.sexe.push(sex[1]);
  }
  return bag;
}

function pickFirst(arr) {
  return (arr || []).map((x) => String(x || '').trim()).find(Boolean) || '';
}

function pickBestDate(list, role) {
  const uniq = [...new Set((list || []).filter(Boolean))];
  let best = ''; let bestScore = 0;
  const today = new Date();
  for (const iso of uniq) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    let score = 0.4;
    if (role === 'naissance') {
      const age = (today - dt) / (365.25 * 86400000);
      if (age >= 16 && age <= 75) score = 0.92;
      else if (age >= 14 && age <= 90) score = 0.7;
    } else {
      const years = (dt - today) / (365.25 * 86400000);
      if (years >= 0 && years <= 15) score = 0.9;
      else if (years < 0) score = 0.5;
    }
    if (score > bestScore) { bestScore = score; best = iso; }
  }
  return { value: best, score: bestScore };
}

/**
 * @param {string} rectoText
 * @param {string} [versoText]
 */
export function parseMoroccanCinTexts(rectoText, versoText = '') {
  const text = `${rectoText || ''}\n${versoText || ''}`;
  const lab = collectLabeled(text);
  const mrz = parseMrz(text);
  const cinPick = pickBestCin([...collectCins(text), ...mrz.cin]);
  const birth = pickBestDate([...lab.naissance, ...mrz.naissance], 'naissance');
  const exp = pickBestDate([...lab.expiration, ...mrz.expiration], 'expiration');
  const nom = (pickFirst([...lab.nom, ...mrz.nom]) || '').replace(/\s+/g, ' ').trim();
  const prenom = (pickFirst([...lab.prenom, ...mrz.prenom]) || '').replace(/\s+/g, ' ').trim();
  const lieu = pickFirst(lab.lieu);
  const sexe = pickFirst([...lab.sexe, ...mrz.sexe]);

  const fields = {
    numero_cin: field(cinPick.value, cinPick.score, cinPick.ranked.slice(1)),
    nom: field(nom, nom ? 0.75 : 0),
    prenom: field(prenom, prenom ? 0.75 : 0),
    date_naissance: field(birth.value, birth.score),
    lieu_naissance: field(lieu, lieu ? 0.65 : 0),
    date_expiration: field(exp.value, exp.score),
    sexe: field(sexe, sexe ? 0.8 : 0),
    nationalite: field('Marocaine', 0.6),
    nom_arabe: field('', 0),
    prenom_arabe: field('', 0),
    autorite: field('', 0),
  };

  return {
    fields,
    worker_form: {
      cin: fields.numero_cin.value,
      prenom: fields.prenom.value,
      nom: fields.nom.value,
      date_naissance: fields.date_naissance.value,
      ville_naissance: fields.lieu_naissance.value,
      nationalite: 'Marocaine',
      sexe: fields.sexe.value,
      date_expiration: fields.date_expiration.value,
    },
  };
}
