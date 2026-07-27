/**
 * Post-traitement client — miroir de ocr-service/app/postprocess.py
 */
const LABEL_NOISE = /\b(?:NOM|PRENOM|PRÉNOM|SURNAM?E|GIVEN|NAME|NATIONALIT[EÉ]|SEXE|SEX|N[EÉ][EÉ]?|LE|LA|DU|DE|DES|CARTE|NATIONALE|IDENTIT[EÉ]|ROYAUME|MAROC|VALABLE|JUSQU|AU|DATE|LIEU|NAISSANCE|BORN|PLACE)\b/gi;

const OCR_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

function cleanSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function removeLabelNoise(s) {
  return cleanSpaces(String(s || '').replace(LABEL_NOISE, ' '));
}

export function normalizePersonToken(s) {
  return cleanSpaces(
    String(s || '')
      .toUpperCase()
      .replace(/[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-\s']/g, ''),
  );
}

export function scoreCin(token) {
  let s = String(token || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z0-9]{1,2})([A-Z0-9]{4,8})$/);
  if (!m) return 0.1;
  let letters = m[1].replace(/\d/g, (c) => ({ 0: 'O', 1: 'I', 8: 'B' }[c] || '')).replace(/[^A-Z]/g, '').slice(0, 2);
  let digits = m[2].split('').map((c) => OCR_DIGIT[c] || c).join('').replace(/\D/g, '');
  if (!(letters && digits.length >= 4 && digits.length <= 7)) return 0.15;
  let score = 0.55;
  if (digits.length === 6) score += 0.3;
  else if (digits.length === 5 || digits.length === 7) score += 0.18;
  return Math.min(1, score);
}

export function cleanCin(raw) {
  let s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = s.match(/^([A-Z0-9]{1,2})([A-Z0-9]{4,8})$/);
  if (!m) return '';
  let letters = m[1].replace(/\d/g, (c) => ({ 0: 'O', 1: 'I', 8: 'B' }[c] || '')).replace(/[^A-Z]/g, '').slice(0, 2);
  let digits = m[2].split('').map((c) => OCR_DIGIT[c] || c).join('').replace(/\D/g, '');
  const v = letters + digits;
  return scoreCin(v) >= 0.5 ? v : '';
}

export function isPlausiblePersonName(value) {
  const raw = String(value || '');
  if (/\d/.test(raw)) return false;
  const v = normalizePersonToken(raw);
  if (v.length < 2 || v.length > 45) return false;
  if (/</.test(raw)) return false;
  const compact = v.replace(/[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '');
  if (compact.length >= 8) {
    const vowels = (compact.match(/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/g) || []).length;
    if (vowels / Math.max(1, compact.length) < 0.18) return false;
  }
  const alnum = v.replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{1,2}\d{4,7}$/.test(alnum)) return false;
  const banned = new Set(['NOM', 'PRENOM', 'ROYAUME', 'MAROC', 'CARTE', 'NATIONALE', 'SEXE', 'NATIONALITE']);
  if (banned.has(v)) return false;
  return true;
}

export function cleanPersonName(raw) {
  if (/\d/.test(String(raw || ''))) return '';
  const t = normalizePersonToken(removeLabelNoise(raw));
  return isPlausiblePersonName(t) ? t : '';
}

export function cleanCity(raw) {
  let t = removeLabelNoise(raw);
  t = cleanSpaces(t.replace(/[^A-Za-zÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ\-\s']/g, '')).toUpperCase();
  if (t.length < 3 || /\d/.test(t)) return '';
  return t;
}

function toIso(d, m, y) {
  let yy = y;
  if (yy < 100) yy = yy < 40 ? 2000 + yy : 1900 + yy;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && yy >= 1920 && yy <= 2100)) return '';
  return `${String(yy).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function cleanDate(raw, role = 'naissance') {
  let t = cleanSpaces(raw || '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5');
  const m = t.match(/(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})/);
  if (!m) return '';
  const iso = toIso(+m[1], +m[2], +m[3]) || toIso(+m[2], +m[1], +m[3]);
  if (!iso) return '';
  const [Y, M, D] = iso.split('-').map(Number);
  const dt = new Date(Y, M - 1, D);
  const today = new Date();
  if (role === 'naissance') {
    const age = (today - dt) / (365.25 * 86400000);
    if (age < 14 || age > 90) return '';
  } else {
    const years = (dt - today) / (365.25 * 86400000);
    if (years < -5 || years > 20) return '';
  }
  return iso;
}

export function cleanSexe(raw) {
  const t = String(raw || '').toUpperCase();
  if (/\bF\b|FEM/.test(t)) return 'F';
  if (/\bM\b|MASC/.test(t)) return 'M';
  const only = t.replace(/[^MF]/g, '');
  return only[0] === 'M' || only[0] === 'F' ? only[0] : '';
}

export function cleanNationalite(raw) {
  const t = cleanSpaces(raw || '').toUpperCase();
  if (!t || /MAROC|MAR\b/.test(t)) return 'Marocaine';
  return removeLabelNoise(t).slice(0, 40) || 'Marocaine';
}

export function cleanMrz(raw) {
  return String(raw || '')
    .toUpperCase()
    .split(/\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20)
    .join('\n');
}

export function postprocessZoneText(field, raw) {
  if (!raw || !String(raw).trim()) return '';
  const f = String(field).replace(/_alt$/, '');
  if (f === 'nom' || f === 'prenom') return cleanPersonName(raw);
  if (f === 'nom_arabe' || f === 'prenom_arabe') {
    const ar = String(raw).match(/[\u0600-\u06FF\s]+/g);
    return ar ? cleanSpaces(ar.join(' ')) : '';
  }
  if (f === 'numero_cin') return cleanCin(raw);
  if (f === 'date_naissance') return cleanDate(raw, 'naissance');
  if (f === 'date_expiration' || f === 'date_emission') return cleanDate(raw, 'expiration');
  if (f === 'lieu_naissance' || f === 'autorite') return cleanCity(raw);
  if (f === 'sexe') return cleanSexe(raw);
  if (f === 'nationalite') return cleanNationalite(raw);
  if (f === 'mrz') return cleanMrz(raw);
  if (f === 'adresse') return cleanSpaces(removeLabelNoise(raw)).slice(0, 120);
  return cleanSpaces(raw);
}

/** Parse MRZ block → bag fields */
export function parseMrzBlock(mrzText) {
  const bag = { nom: [], prenom: [], cin: [], naissance: [], expiration: [], sexe: [] };
  const lines = String(mrzText || '').toUpperCase().replace(/ /g, '').split(/\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20);
  if (!lines.length) return bag;
  if (lines[0].includes('<<')) {
    const body = lines[0].replace(/^I<?[A-Z]{0,3}/, '');
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
