/**
 * cinOcr.js — Mapping CIN marocaine (Mindee = source officielle)
 * Recto → identité | Verso → adresse uniquement
 */

export function emptyCINExtract() {
  return {
    numero_cin: '',
    prenom: '',
    nom: '',
    date_naissance: '',
    lieu_naissance: '',
    adresse: '',
    ville_adresse: '',
    complement_adresse: '',
    date_expiration: '',
    sexe: '',
    nationalite: '',
    confidence: 0,
  };
}

/** Extrait la valeur d'un champ Mindee (value, items[], array, nested fields). */
export function pickMindeeValue(field) {
  if (field == null) return '';
  if (typeof field === 'string' || typeof field === 'number') return String(field).trim();
  if (Array.isArray(field)) {
    return field.map(pickMindeeValue).filter(Boolean).join(' ').trim();
  }
  if (typeof field === 'object') {
    if (Array.isArray(field.items)) {
      return field.items.map(pickMindeeValue).filter(Boolean).join(' ').trim();
    }
    if (Array.isArray(field.values)) {
      return field.values.map(pickMindeeValue).filter(Boolean).join(' ').trim();
    }
    if (Array.isArray(field.predictions)) {
      return field.predictions.map(pickMindeeValue).filter(Boolean).join(' ').trim();
    }
    if (field.content != null && field.content !== '') {
      return String(field.content).trim();
    }
    if (field.value !== undefined && field.value !== null) {
      if (typeof field.value === 'object') {
        return pickMindeeValue(field.value);
      }
      if (Array.isArray(field.value)) {
        return field.value.map((v) => pickMindeeValue(v)).filter(Boolean).join(' ').trim();
      }
      return String(field.value).trim();
    }
    if (field.fields) {
      const parts = Object.values(field.fields).map(pickMindeeValue).filter(Boolean);
      if (parts.length) return parts.join(' ').trim();
    }
    if (field.text) return String(field.text).trim();
  }
  return '';
}

function pickMindeeConfidence(field) {
  if (!field || typeof field !== 'object') return 0;
  if (typeof field.confidence === 'number') return field.confidence;
  if (typeof field.probability === 'number') return field.probability;
  if (Array.isArray(field.items) && field.items[0]) return pickMindeeConfidence(field.items[0]);
  if (Array.isArray(field) && field[0]) return pickMindeeConfidence(field[0]);
  return 0;
}

function normDateISO(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[\s\/\.\-](\d{1,2})[\s\/\.\-](\d{2,4})$/);
  if (m) {
    var yy = m[3];
    if (yy.length === 2) {
      yy = parseInt(yy, 10) >= 30 ? '19' + yy : '20' + yy;
    }
    return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const m2 = v.match(/^(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return '';
}

function normSex(raw) {
  const v = (raw || '').toUpperCase();
  if (v === 'M' || v === 'MALE' || v === 'MASCULIN') return 'M';
  if (v === 'F' || v === 'FEMALE' || v === 'FEMININ') return 'F';
  return v === 'M' || v === 'F' ? v : '';
}

function normNationality(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^MAR(OC(AIN(E)?)?)?$/i.test(v)) return 'MAROC';
  return v.toUpperCase();
}

function normCIN(raw) {
  const v = (raw || '').replace(/\s/g, '').toUpperCase();
  const m = v.match(/([A-Z]{1,3}\d{4,8})/);
  return m ? m[1] : v;
}

export function isValidCINNumber(raw) {
  const v = normCIN(raw);
  return /^[A-Z]{1,3}\d{5,8}$/.test(v);
}

function isValidBirthDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const y = parseInt(iso.slice(0, 4), 10);
  const now = new Date().getFullYear();
  return y >= 1920 && y <= now;
}

function isValidExpiryDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const y = parseInt(iso.slice(0, 4), 10);
  return y >= 2020 && y <= 2065;
}

function isValidAddress(raw) {
  const a = cleanAddressLine(raw);
  if (!a || a.length < 8 || a.length > 220) return false;
  if (a.includes('<<')) return false;
  if (isMrzNoiseLine(a)) return false;
  if (/^(SEXE|MRZ|CNIE|CARTE|IDENTITE|NATIONALITE|ROYAUME|IDMAR)\b/.test(a)) return false;
  if (/^[A-Z]{2,24}$/.test(a.replace(/\s/g, '')) && !STREET_HINT_RE.test(a) && !/\d/.test(a)) return false;
  if (!/\d/.test(a) && !STREET_HINT_RE.test(a) && !MOROCCO_PLACE_RE.test(a)) return false;
  return true;
}

function scoreAddress(raw) {
  const a = cleanAddressLine(raw);
  if (!isValidAddress(a)) return -1;
  let score = a.length;
  if (STREET_HINT_RE.test(a)) score += 20;
  if (MOROCCO_PLACE_RE.test(a)) score += 12;
  if (/\d{1,4}\s/.test(a)) score += 8;
  return score;
}

function pickBestAddress(candidates) {
  let best = '';
  let bestScore = -1;
  for (let i = 0; i < (candidates || []).length; i++) {
    const c = candidates[i];
    if (!c || !String(c).trim()) continue;
    const s = scoreAddress(c);
    if (s > bestScore) {
      bestScore = s;
      best = cleanAddressLine(c);
    }
  }
  return best;
}

/** Adresse Mindee verso — nested address + champs plats. */
function pickMindeeAddressFromFields(f) {
  if (!f || typeof f !== 'object') return { adresse: '', ville_adresse: '', complement_adresse: '', pays: '' };
  const nested = mapMindeeAddressFields(f.address);
  const parts = [];
  if (nested.adresse) parts.push(nested.adresse);

  const street = pickMindeeValue(
    f.street || f.address_line_1 || f.address_line1 || f.line1 || f.rue || f.domicile || f.residence,
  );
  const city = pickMindeeValue(f.city || f.town || f.ville);
  const complement = pickMindeeValue(f.complement || f.address_line_2 || f.po_box);
  if (street && city) {
    parts.push(street.toUpperCase().includes(city.toUpperCase()) ? street : `${street}, ${city}`);
  } else if (street) {
    parts.push(street);
  } else if (city) {
    parts.push(city);
  }

  for (const [key, val] of Object.entries(f)) {
    if (!/(?:adresse|address|domicile|street|rue|residence|localisation)/i.test(key)) continue;
    if (/(?:country|pays|nationality|birth|naissance)/i.test(key)) continue;
    const v = pickMindeeValue(val);
    if (v && v.length >= 8) parts.push(v);
  }

  const flat = pickMindeeValue(f.address);
  if (flat && typeof flat === 'string' && flat.length >= 8 && !flat.includes('fields')) {
    parts.push(flat);
  }

  const adresse = pickBestAddress(parts);
  return {
    adresse,
    ville_adresse: nested.ville_adresse || city || '',
    complement_adresse: nested.complement_adresse || complement || '',
    pays: nested.pays || pickMindeeValue(f.country || f.pays) || '',
  };
}

function logAdresseResolution(trace) {
  console.info('[OCR CIN] adresse résolution', {
    raw_mindee: trace.raw_mindee,
    raw_tesseract: trace.raw_tesseract,
    adresse_final: trace.adresse_final,
    source: trace.source,
  });
}

/** Priorité adresse : Mindee verso → OCR verso → extracts verso → base. */
function resolveCINAddress(opts) {
  const mindeeVersoFields = opts?.mindeeVersoFields || null;
  const versoText = opts?.versoText || '';
  const versoExtracts = opts?.versoExtracts || [];
  const base = opts?.base || emptyCINExtract();
  const trace = { raw_mindee: null, raw_tesseract: null, adresse_final: '', source: 'none' };

  const candidates = [];

  if (mindeeVersoFields) {
    const addr = pickMindeeAddressFromFields(normalizeMindeeFieldMap(mindeeVersoFields));
    trace.raw_mindee = addr.adresse || null;
    if (addr.adresse) candidates.push({ v: addr.adresse, p: 100 });
  }

  if (versoText) {
    const fromVerso = extractVersoAddressFromText(versoText);
    trace.raw_tesseract = fromVerso || null;
    if (fromVerso) candidates.push({ v: fromVerso, p: 95 });
  }

  for (let i = 0; i < versoExtracts.length; i++) {
    const ex = versoExtracts[i];
    if (ex?.adresse) candidates.push({ v: ex.adresse, p: 90 - i });
    if (ex?.ville_adresse && ex?.adresse) {
      const combo = `${ex.adresse} ${ex.ville_adresse}`.trim();
      candidates.push({ v: combo, p: 88 - i });
    }
  }

  if (base.adresse) candidates.push({ v: base.adresse, p: 70 });

  let best = '';
  let bestP = -1;
  let source = 'none';
  for (let ci = 0; ci < candidates.length; ci++) {
    const item = candidates[ci];
    const s = scoreAddress(item.v);
    if (s < 0) continue;
    const total = s + (item.p || 0);
    if (total > bestP) {
      bestP = total;
      best = cleanAddressLine(item.v);
      if (item.p >= 100) source = 'mindee_verso';
      else if (item.p >= 95) source = 'verso_ocr';
      else if (item.p >= 80) source = 'verso_extract';
      else source = 'base_merge';
    }
  }

  trace.adresse_final = best || '';
  trace.source = source;
  logAdresseResolution(trace);

  const mindeeAddr = mindeeVersoFields
    ? pickMindeeAddressFromFields(normalizeMindeeFieldMap(mindeeVersoFields))
    : { ville_adresse: '', complement_adresse: '', pays: '' };

  return {
    adresse: best,
    ville_adresse: mindeeAddr.ville_adresse || base.ville_adresse || '',
    complement_adresse: mindeeAddr.complement_adresse || base.complement_adresse || '',
    pays: mindeeAddr.pays || base.pays || '',
    source,
  };
}

/** Nettoie les champs incertains / invalides — laisser vide plutôt qu’une mauvaise valeur. */
export function sanitizeCINExtract(mapped) {
  const e = { ...emptyCINExtract(), ...(mapped || {}) };
  const out = { ...e };

  out.numero_cin = isValidCINNumber(e.numero_cin) ? normCIN(e.numero_cin) : '';
  out.prenom = isValidPersonName(e.prenom, true) ? normalizePrenomValue(e.prenom) : '';
  out.nom = isValidPersonName(e.nom, false) ? cleanNamePart(e.nom, true) : '';
  out.date_naissance = isValidBirthDate(normDateISO(e.date_naissance)) ? normDateISO(e.date_naissance) : '';
  out.date_expiration = isValidExpiryDate(normDateISO(e.date_expiration)) ? normDateISO(e.date_expiration) : '';
  out.lieu_naissance = (e.lieu_naissance || '').trim();
  if (out.lieu_naissance && (out.lieu_naissance.length < 2 || /\d{5,}/.test(out.lieu_naissance) || isMrzNoiseLine(out.lieu_naissance))) {
    out.lieu_naissance = '';
  }
  out.adresse = isValidAddress(e.adresse) ? cleanAddressLine(e.adresse) : '';
  out.ville_adresse = (e.ville_adresse || '').trim();
  if (out.ville_adresse && (out.ville_adresse.length < 2 || isMrzNoiseLine(out.ville_adresse))) out.ville_adresse = '';
  out.complement_adresse = (e.complement_adresse || '').trim();
  out.sexe = normSex(e.sexe);
  out.nationalite = normNationality(e.nationalite);
  return out;
}

/** Ligne d'adresse CNIE — conserve chiffres (cleanNamePart les supprime). */
function cleanAddressLine(raw) {
  return (raw || '')
    .replace(/^[\s\/\-\.:]+/, '')
    .replace(/[^0-9A-Za-z\u00C0-\u024F\s\-',°\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isMrzNoiseLine(line) {
  const compact = (line || '').replace(/\s/g, '').toUpperCase();
  if (compact.length < 10) return false;
  if (compact.includes('<<')) return true;
  if (/^IDMAR|^I<MAR|^IDMRC|^I<MRC/.test(compact)) return true;
  if (typeof MRZ_DATE_LINE_RE !== 'undefined' && MRZ_DATE_LINE_RE.test(compact)) return true;
  if (/^\d{6}\d[MF]\d{6}/.test(compact)) return true;
  return false;
}

/**
 * Adresse verso CNIE — ex. « 5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA »
 * (sans label ADRESSE:, souvent au-dessus de la MRZ).
 */
/** Villes / quartiers fréquents sur CNIE marocaine (OCR partiel toléré). */
const MOROCCO_PLACE_RE = /\b(?:CASABLANCA|CASA|RABAT|SALE|SALÉ|FES|FEZ|MEKNES|MEKNÈS|TANGER|TANGIER|MARRAKECH|AGADIR|KENITRA|MOHAMMEDIA|OUJDA|NADOR|TEMARA|BERNOUSSI|BOURGOGNE|SIDI\s*OTHMANE|AIN\s*SEBAA|AIN\s*CHOK|HAY\s*MOHAMMADI|LAAYOUNE|SAFI|BENI\s*MELLAL|TETOUAN|KHOURIBGA|EL\s*JADIDA|SETTAT|KHÉMISSET|KHEMISSET)\b/i;

const STREET_HINT_RE = /\b(?:RUE|RÉS|RES|RESIDENCE|RÉSIDENCE|AV|AVE|AVENUE|BD|BOULEVARD|BLVD|QUARTIER|QT|LOT|LOTISSEMENT|IMPASSE|ANGLE|APT|APP|APPT|IMMEUBLE|IMM|BLOC|HAY|DERB|N°|NO|NUM|CITE|CITÉ)\b/i;

export function extractVersoAddressFromText(raw) {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parts = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMrzNoiseLine(line)) continue;
    const upper = line.toUpperCase();
    if (/^(ROYAUME|MAROC|MAROCAINE|CARTE|IDENTITE|NATIONALITE|VALABLE|FILIATION|FAMILLE|KINGDOM|CNIE)\b/.test(upper)) continue;

    const labeled = line.match(/^(?:ADRESSE|DOMICILE|ADDRESS|Domicile)\s*[:\.]?\s*(.+)$/i);
    if (labeled) {
      const a = cleanAddressLine(labeled[1]);
      if (a.length >= 6) parts.push(a);
      continue;
    }

    const hasDigit = /\d/.test(line);
    const looksLikeStreet = STREET_HINT_RE.test(line) || /^\d{1,4}\s+[A-ZÀ-Ü]/.test(line);
    const looksLikeCity = MOROCCO_PLACE_RE.test(line);
    const longLatin = /^[0-9A-ZÀ-Ü\s\-',°\.]{12,}$/i.test(line) && /[A-ZÀ-Ü]{4,}/i.test(line);

    if ((hasDigit && looksLikeStreet) || (looksLikeStreet && line.length >= 10)
      || (looksLikeCity && hasDigit) || (hasDigit && longLatin && line.length >= 14)) {
      const a = cleanAddressLine(line);
      if (a.length >= 8 && !/^(SEXE|MRZ|CNIE|CIN)\b/.test(a)) parts.push(a);
      continue;
    }

    // Ligne rue + ville sur la ligne suivante (OCR coupe souvent en 2)
    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (!isMrzNoiseLine(next) && !next.includes('<<')) {
        if (hasDigit && looksLikeStreet && MOROCCO_PLACE_RE.test(next)) {
          const combo = cleanAddressLine(`${line} ${next}`);
          if (combo.length >= 10) parts.push(combo);
        } else if (looksLikeStreet && /^[A-ZÀ-Ü\s\-]{3,30}$/i.test(next.trim()) && MOROCCO_PLACE_RE.test(next)) {
          const combo = cleanAddressLine(`${line} ${next}`);
          if (combo.length >= 10) parts.push(combo);
        }
      }
    }
  }

  const joined = [...new Set(parts)].join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length >= 8) return joined;

  const blob = cleanAddressLine(lines.filter((l) => !isMrzNoiseLine(l)).join(' '));
  const m = blob.match(
    /\d{1,4}\s+(?:RUE|RES|RÉS|AV|BD|BOULEVARD|BLOC|LOT|HAY|IMPASSE|ANGLE)[\s\S]{4,90}?(?:CASABLANCA|CASA|RABAT|BERNOUSSI|BOURGOGNE|SALE|FES|TANGER|MARRAKECH|MOHAMMEDIA|KENITRA|AGADIR|OUJDA|TEMARA|MEKNES|SIDI\s*OTHMANE)/i,
  );
  if (m) return m[0].replace(/\s+/g, ' ').trim().toUpperCase();

  // Dernière ligne « adresse-like » la plus longue (hors MRZ)
  let best = '';
  for (const line of lines) {
    if (isMrzNoiseLine(line) || !/\d/.test(line)) continue;
    const a = cleanAddressLine(line);
    if (a.length > best.length && a.length >= 12 && STREET_HINT_RE.test(a)) best = a;
  }
  return best;
}

/** address.street + address.city → adresse (format Mindee officiel) */
function mapMindeeAddressFields(addressField) {
  if (!addressField) {
    return { adresse: '', ville_adresse: '', complement_adresse: '', pays: '' };
  }
  const root = addressField.fields || addressField;
  const street = pickMindeeValue(root.street || root.address_line_1 || root.line1);
  const city = pickMindeeValue(root.city);
  const complement = pickMindeeValue(root.complement || root.address_line_2 || root.po_box);
  const pays = pickMindeeValue(root.country);

  let adresse = '';
  if (street && city) {
    adresse = street.toUpperCase().includes(city.toUpperCase()) ? street : `${street}, ${city}`;
  } else {
    adresse = street || city || '';
  }

  return {
    adresse: adresse.trim(),
    ville_adresse: city || '',
    complement_adresse: complement || '',
    pays: pays || '',
  };
}

export function normalizeMindeeFieldMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  function walk(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => walk(item, depth + 1));
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      if (val == null) continue;
      const lk = key.toLowerCase();
      const isIdentityKey = /^(given|surname|first|last|family|nom|prenom|mrz|document|id_|cin|date|dob|birth|expir|sex|gender|national|name|address)/i.test(key)
        || /(?:birth|naissance|expir|expiry|valid|document|surname|given|adresse|domicile|street|rue|residence)/i.test(key);
      if (isIdentityKey) {
        if (typeof val === 'string' || typeof val === 'number') {
          out[key] = { value: String(val) };
        } else {
          out[key] = val;
        }
      }
      if (val && typeof val === 'object') {
        if (val.fields) walk(val.fields, depth + 1);
        else if (!isIdentityKey || depth < 4) walk(val, depth + 1);
      }
    }
  }
  walk(raw, 0);
  if (!Object.keys(out).length) {
    for (const [key, val] of Object.entries(raw)) {
      if (val == null) continue;
      if (typeof val === 'string' || typeof val === 'number') {
        out[key] = { value: String(val) };
      } else {
        out[key] = val;
      }
    }
  }
  return out;
}

/** Extrait `fields` depuis réponse Mindee (v1 / v2). */
export function extractMindeeFields(payload) {
  if (!payload) return null;
  if (payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)) {
    return normalizeMindeeFieldMap(payload.fields);
  }
  const pred = payload?.inference?.result?.fields
    || payload?.document?.inference?.prediction
    || payload?.document?.inference?.result?.fields
    || payload?.inference?.prediction
    || payload?.prediction
    || payload?.result?.fields;
  if (pred) return normalizeMindeeFieldMap(pred);
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return normalizeMindeeFieldMap(payload);
  }
  return null;
}

/**
 * Mapping Mindee strict (CIN marocaine) :
 * document_number→cin, given_names→prenom, surnames→nom,
 * date_of_birth→date_naissance, place_of_birth→ville_naissance,
 * address.street+city→adresse, date_of_expiry→date_expiration,
 * sex→sexe, nationality→nationalite
 */
export function mapMindeeFields(fields, side = 'recto') {
  if (!fields || typeof fields !== 'object') return emptyCINExtract();

  const f = normalizeMindeeFieldMap(fields);
  const addr = side === 'verso' ? pickMindeeAddressFromFields(f) : mapMindeeAddressFields(f.address);

  const docNum = pickMindeeValue(
    f.document_number || f.id_number || f.document_id || f.cin_number || f.cnie_number,
  );
  let surnames = pickMindeeValue(
    f.surnames || f.surname || f.last_name || f.last_names || f.family_name || f.nom,
  );
  let given = pickMindeeGivenNames(f, surnames);
  let dob = pickMindeeValue(
    f.date_of_birth || f.birth_date || f.date_naissance || f.birthdate || f.dob,
  );
  if (!dob) {
    for (const [key, val] of Object.entries(f)) {
      if (/birth|naissance|dob/i.test(key) && !/place|lieu|location|city|country|pays/i.test(key)) {
        const v = pickMindeeValue(val);
        if (v && /\d/.test(v)) { dob = v; break; }
      }
    }
  }
  let doe = pickMindeeValue(
    f.date_of_expiry || f.expiry_date || f.expiration_date || f.date_expiration,
  );
  if (!doe) {
    for (const [key, val] of Object.entries(f)) {
      if (/expir|expiry|valid|valable/i.test(key)) {
        const v = pickMindeeValue(val);
        if (v && /\d/.test(v)) { doe = v; break; }
      }
    }
  }
  // Recto : pas de MRZ pour le prénom (MRZ = verso ; évite faux positifs << sur recto)
  if (!given && side !== 'recto') {
    var mrzTemp = emptyCINExtract();
    var mrzBlob = [
      pickMindeeValue(f.mrz_line_1 || f.mrz_line1),
      pickMindeeValue(f.mrz_line_2 || f.mrz_line2),
      pickMindeeValue(f.mrz_line_3 || f.mrz_line3),
      pickMindeeValue(f.mrz),
    ].filter(Boolean).join('\n');
    parseMrzLines(mrzBlob, mrzTemp);
    given = pickPrenomAvoidingNom([mrzTemp.prenom], surnames) || '';
    if (!surnames && mrzTemp.nom) surnames = mrzTemp.nom;
  }
  if (!surnames) {
    var mrzNomTemp = emptyCINExtract();
    parseMrzLines([
      pickMindeeValue(f.mrz_line_1 || f.mrz_line1),
      pickMindeeValue(f.mrz_line_2 || f.mrz_line2),
      pickMindeeValue(f.mrz_line_3 || f.mrz_line3),
      pickMindeeValue(f.mrz),
    ].filter(Boolean).join('\n'), mrzNomTemp);
    if (mrzNomTemp.nom) surnames = mrzNomTemp.nom;
  }

  for (const [key, val] of Object.entries(f)) {
    if (!given && /given|first|prenom|forename|christian/i.test(key)) {
      const v = pickMindeeValue(val);
      if (v && isValidPersonName(v, true) && !namesEqual(v, surnames)) given = v;
    }
    if (/mrz/i.test(key) && side !== 'recto') {
      const blob = pickMindeeValue(val);
      if (!blob) continue;
      const mrzExtra = emptyCINExtract();
      parseMrzLines(blob, mrzExtra);
      if (!given && mrzExtra.prenom) {
        given = pickPrenomAvoidingNom([mrzExtra.prenom], surnames) || '';
      }
      if (!surnames && mrzExtra.nom) surnames = mrzExtra.nom;
    }
  }

  given = normalizePrenomValue(given);
  if (surnames && namesEqual(given, surnames)) given = '';
  surnames = cleanNamePart(surnames, true);
  const pob = pickMindeeValue(f.place_of_birth || f.birth_place || f.lieu_naissance);
  const sexRaw = pickMindeeValue(f.sex || f.gender || f.sexe);
  const natRaw = pickMindeeValue(f.nationality || f.nationalite);

  if (side === 'verso') {
    return sanitizeCINExtract({
      ...emptyCINExtract(),
      adresse: addr.adresse,
      ville_adresse: addr.ville_adresse,
      complement_adresse: addr.complement_adresse,
      pays: addr.pays,
      confidence: pickMindeeConfidence(f.address),
    });
  }

  const confidences = [
    pickMindeeConfidence(f.document_number || f.id_number),
    pickMindeeConfidence(f.given_names || f.given_name),
    pickMindeeConfidence(f.surnames || f.surname),
  ].filter(Boolean);

  return sanitizeCINExtract({
    numero_cin: normCIN(docNum),
    prenom: given,
    nom: surnames.toUpperCase(),
    date_naissance: normDateISO(dob),
    lieu_naissance: pob,
    adresse: addr.adresse,
    ville_adresse: addr.ville_adresse,
    complement_adresse: addr.complement_adresse,
    pays: addr.pays,
    date_expiration: normDateISO(doe),
    sexe: normSex(sexRaw),
    nationalite: normNationality(natRaw),
    confidence: confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0,
  });
}

/** Fusion recto (identité) + verso (adresse + MRZ si identité recto incomplète). */
export function mergeCINRectoVerso(recto, verso) {
  const r = { ...emptyCINExtract(), ...(recto || {}) };
  const v = { ...emptyCINExtract(), ...(verso || {}) };

  const complement = v.complement_adresse || r.complement_adresse || '';
  let adresse = pickBestAddress([v.adresse, r.adresse]);
  if (complement && adresse && !adresse.includes(complement)) {
    adresse = `${adresse} ${complement}`.trim();
  } else if (complement && !adresse) {
    adresse = pickBestAddress([complement]) || complement;
  }

  const cinCand = [r.numero_cin, v.numero_cin].map(normCIN).filter(isValidCINNumber);

  const mergedNom = pickBestPersonName([r.nom, v.nom], false);

  return sanitizeCINExtract({
    numero_cin: cinCand[0] || '',
    prenom: pickPrenomAvoidingNom([r.prenom], mergedNom),
    nom: mergedNom,
    date_naissance: r.date_naissance || v.date_naissance || '',
    lieu_naissance: r.lieu_naissance || v.lieu_naissance || '',
    sexe: r.sexe || v.sexe || '',
    nationalite: r.nationalite || v.nationalite || '',
    date_expiration: r.date_expiration || v.date_expiration || '',
    adresse,
    ville_adresse: v.ville_adresse || r.ville_adresse || '',
    complement_adresse: complement,
    pays: v.pays || r.pays || '',
    confidence: Math.max(r.confidence || 0, v.confidence || 0),
  });
}

function displayNationality(code) {
  if (!code) return 'Marocaine';
  if (/^MAR(OC(AIN(E)?)?)?$/i.test(code)) return 'Marocaine';
  return code;
}

/** Modèle fusionné → champs formulaire Ouvrier (noms exacts EMPTY_FORM) */
export function mapToWorkerForm(cin) {
  const c = sanitizeCINExtract(cin);
  const lieu = (c.lieu_naissance || '').trim();

  return {
    cin: c.numero_cin || '',
    prenom: c.prenom || '',
    nom: c.nom || '',
    date_naissance: c.date_naissance || '',
    ville_naissance: lieu,
    adresse: c.adresse || '',
    date_expiration: c.date_expiration || '',
    sexe: c.sexe || '',
    nationalite: displayNationality(c.nationalite),
    confidence: c.confidence || 0,
    provider: c.provider || 'mindee',
  };
}

export function toStandardOcrResult(merged, provider) {
  return mapToWorkerForm({ ...merged, provider });
}

export function buildOcrWarning(form, hasRecto, hasVerso) {
  if (!hasRecto && !hasVerso) return 'Texte illisible — completez les champs manuellement.';
  if (hasRecto && !hasVerso) {
    return 'Importez le verso CIN (MRZ en bas) pour le prénom, l\'adresse et une extraction fiable.';
  }
  const missing = [];
  if (!form.cin) missing.push('CIN');
  if (!form.nom) missing.push('nom');
  if (!form.prenom) missing.push('prenom');
  if (missing.length === 3) return 'Aucun champ detecte — saisissez manuellement.';
  if (missing.length > 0) {
    if (missing.length === 1 && missing[0] === 'prenom' && hasVerso) {
      return 'Nom et CIN OK — prénom illisible : scannez le verso (bande MRZ) ou saisissez le prénom.';
    }
    return 'Extraction partielle — verifiez : ' + missing.join(', ') + '.';
  }
  if (!form.date_naissance || !form.date_expiration) {
    return 'Identite OK — verifiez les dates si necessaire.';
  }
  return '';
}

/* ── Fallback Tesseract (si Mindee indisponible) ── */

var PRENOM_LABEL_RE = /^(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM|PRE\s*NOM|GIVEN\s*NAM?ES?|GIVEN\s*NAME|FIRST\s*NAM?E|الاسم\s*الشخصي)(?:\s*\/\s*[\w\s]*)?\s*:?\s*$/i;
var NOM_LABEL_RE = /^(?:NOM|N[O0]M|SURNAM?E|LAST\s*NAM?E|FAMILY\s*NAM?E|الاسم\s*العائلي)(?:\s*\/\s*[\w\s]*)?\s*:?\s*$/i;
var PRENOM_INLINE_RE = /(?:^|\s)(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM|PRE\s*NOM|GIVEN\s*NAM?ES?|FIRST\s*NAM?E)\s*[:\.\-]?\s*(.+)$/i;
var NOM_INLINE_RE = /(?:^|\b)(?:NOM|SURNAM?E|LAST\s*NAM?E|FAMILY\s*NAM?E)\s*[:\.\-]?\s*(.+)$/i;

/** Fragments de labels bilingues — jamais des noms réels. */
var LABEL_FRAGMENT_RE = /^(NAME|NAMES|GIVEN|FIRST|LAST|SURNAME|FAMILY|NOM|PRENOM|PRNOM|SEXE|DATE|LIEU|NEE|NÉE)$/i;
/** Codes pays MRZ (3 lettres) — pas des noms de famille. */
var MRZ_COUNTRY_CODE_RE = /^(MAR|MOR|FRA|USA|GBR|DEU|ESP|ITA|BEL|NLD|PRT|TUN|DZA|EGY|SAU|CAN|CHE)$/i;
/** Ligne MRZ date/sexe (ligne 2) — ne contient pas nom/prénom. */
var MRZ_DATE_LINE_RE = /^\d{6}[0-9MFX<][0-9MFX<]\d{6}[A-Z<]{3}/;
var BIRTH_LABEL_RE = /^(?:N[EÉÈÊ6][EÉÈÊ]?\s*(?:LE|A|À)?|NEE?\s*LE|NE\s*(?:E|É)|DATE\s*(?:DE\s*)?NAISSANCE|DATE\s*OF\s*BIRTH|BORN(?:\s*ON)?)(?:\s*\/\s*[\w\s]*)?\s*:?\s*$/i;
var BIRTH_INLINE_RE = /(?:N[EÉÈÊ6][EÉÈÊ]?\s*(?:LE|A|À)?|NEE?\s*LE|DATE\s*(?:DE\s*)?NAISSANCE|DATE\s*OF\s*BIRTH|BORN(?:\s*ON)?)\s*[:\.\-]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i;
var EXPIRY_INLINE_RE = /(?:VALABLE\s*(?:JUSQU['']?\s*)?(?:AU|A|LE)?|DATE\s*(?:D['']?)?EXPIR(?:ATION)?|EXPIR(?:Y|ES)\s*(?:ON|DATE)?)\s*[:\.\-]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i;
var DATE_TOKEN_RE = /^(\d{1,2})[\s\.\/\-](\d{1,2})[\s\.\/\-](\d{2,4})$/;

function parseDateToken(raw) {
  return normDateISO(String(raw || '').trim());
}

/** Extrait dates depuis labels CNIE + MRZ (recto/verso). */
export function extractDatesFromText(text) {
  var out = {
    date_naissance: '',
    date_expiration: '',
    sexe: '',
  };
  if (!text || String(text).trim().length < 4) return out;

  var temp = emptyCINExtract();
  parseMrzLines(text, temp);
  out.date_naissance = temp.date_naissance || '';
  out.date_expiration = temp.date_expiration || '';
  out.sexe = temp.sexe || '';

  parseCINDateLabels(text, out);
  return out;
}

function parseCINDateLabels(raw, out) {
  var text = String(raw || '');

  var birthInline = text.match(BIRTH_INLINE_RE);
  if (birthInline && !out.date_naissance) {
    out.date_naissance = parseDateToken(birthInline[1]);
  }
  var expInline = text.match(EXPIRY_INLINE_RE);
  if (expInline && !out.date_expiration) {
    out.date_expiration = parseDateToken(expInline[1]);
  }

  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (!out.date_naissance) {
      if (BIRTH_LABEL_RE.test(line)) {
        for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          var nextBirth = parseDateToken(lines[j]);
          if (nextBirth) { out.date_naissance = nextBirth; break; }
        }
      }
      var sameLineBirth = line.match(BIRTH_INLINE_RE);
      if (sameLineBirth) out.date_naissance = parseDateToken(sameLineBirth[1]);
    }

    if (!out.date_expiration) {
      var expLabel = /^(?:VALABLE|DATE\s*(?:D['']?)?EXPIR|EXPIR(?:Y|ES)\s*DATE?)(?:\s*\/\s*[\w\s]*)?\s*:?\s*$/i;
      if (expLabel.test(line)) {
        for (var k = i + 1; k < Math.min(i + 4, lines.length); k++) {
          var nextExp = parseDateToken(lines[k]);
          if (nextExp) { out.date_expiration = nextExp; break; }
        }
      }
    }

    if (DATE_TOKEN_RE.test(line.replace(/\s/g, ' '))) {
      var tok = parseDateToken(line);
      if (tok && !out.date_naissance) {
        var prev = (lines[i - 1] || '').toUpperCase();
        if (/NEE|NAISS|BIRTH|N[EÉ]/.test(prev)) out.date_naissance = tok;
      }
    }
  }

  if (!out.date_naissance) {
    var loose = text.match(/\b(\d{1,2})[\s\.\/\-](\d{1,2})[\s\.\/\-]((?:19|20)\d{2})\b/);
    if (loose) out.date_naissance = parseDateToken(loose[0]);
  }
}

function parseMrzDatesLoose(raw, out) {
  var compact = String(raw || '').replace(/\s/g, '').toUpperCase();
  var m = compact.match(/(\d{6})\d[0-9MFX<][0-9MFX<](\d{6})(?:MAR|MOR|[A-Z]{3}|<)/);
  if (!m) return;
  if (!out.date_naissance) out.date_naissance = parseMrzDate(m[1]);
  if (!out.date_expiration) out.date_expiration = parseMrzDate(m[2]);
  if (!out.sexe) {
    var sexM = compact.match(/\d{6}\d([MF])\d{6}/);
    if (sexM) out.sexe = sexM[1];
  }
}

function isPrenomLabelLine(line) {
  return PRENOM_LABEL_RE.test((line || '').trim());
}

function isNomLabelLine(line) {
  return NOM_LABEL_RE.test((line || '').trim());
}

function isNameLabelLine(line) {
  return isPrenomLabelLine(line) || isNomLabelLine(line);
}

/** Corrige confusions OCR fréquentes dans les noms (5→S, 0→O, 1→I…). */
function fixOcrNameChars(raw) {
  return (raw || '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/2/g, 'Z');
}

function cleanNamePart(raw, upper) {
  var v = fixOcrNameChars(raw || '')
    .replace(/^[\s\/\-\.:]+/, '')
    .replace(/[^A-Za-z\u00C0-\u024F\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!v || v.length < 2) return '';
  if (LABEL_FRAGMENT_RE.test(v)) return '';
  if (/^(NOM|PRENOM|PRNOM|PRÉNOM|SEXE|MAROC|CARTE|NATIONAL|VALABLE|NEE|NÉE|DATE|LIEU)$/i.test(v)) return '';
  if (/^[A-Z]{1,3}\d{3,8}$/i.test(v.replace(/\s/g, ''))) return '';
  return upper ? v.toUpperCase() : v;
}

function normalizePrenomValue(raw) {
  var line = String(raw || '').split('\n')[0].trim();
  line = line.replace(/\s+(?:N[°O]|CIN|CNIE|BA\d|AB\d|[A-Z]{1,3}\d{4,}).*$/i, '').trim();
  var v = cleanNamePart(line, false);
  if (!v || isNameLabelLine(v)) return '';
  var words = v.split(/\s+/).filter(Boolean).slice(0, 3);
  return titleCaseName(words.join(' '));
}

function givenFromFullName(full, surname) {
  var f = (full || '').trim();
  var s = (surname || '').trim().toUpperCase();
  if (!f || !s) return '';
  var parts = f.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return normalizePrenomValue(f);
  if (parts[parts.length - 1].toUpperCase() === s) {
    return normalizePrenomValue(parts.slice(0, -1).join(' '));
  }
  if (parts[0].toUpperCase() === s) {
    return normalizePrenomValue(parts.slice(1).join(' '));
  }
  return normalizePrenomValue(parts[0]);
}

function namesEqual(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

function isPrenomDebugEnabled() {
  try {
    if (import.meta.env.VITE_OCR_DEBUG === 'true') return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('citymo_ocr_debug') === '1') return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('citymo_prenom_debug') === '1') return true;
  } catch (_) { /* ignore */ }
  return false;
}

function logPrenomResolution(trace) {
  var payload = {
    raw_given_names: trace.raw_given_names_recto,
    raw_given_name: trace.raw_given_name_recto,
    raw_first_name: trace.raw_first_name_recto,
    raw_surname: trace.raw_surname_recto,
    raw_names: trace.raw_names_recto,
    raw_mrz: trace.raw_mrz,
    prenom_final: trace.prenom_final,
    source: trace.source,
  };
  console.info('[OCR CIN] prénom résolution', payload);
  if (isPrenomDebugEnabled()) console.info('[OCR CIN] prénom résolution (debug)', trace);
}

/** Retire les tokens identiques au nom de famille dans une chaîne prénom. */
function stripSurnameFromGiven(given, surname) {
  var g = normalizePrenomValue(given);
  var sur = cleanNamePart(surname, true);
  if (!g) return '';
  if (!sur) return g;
  if (namesEqual(g, sur)) return '';
  var surTokens = sur.split(/\s+/).filter(Boolean);
  var gTokens = g.split(/\s+/).filter(Boolean);
  var kept = gTokens.filter(function(t) {
    return !surTokens.some(function(st) { return namesEqual(t, st); });
  });
  if (!kept.length) return '';
  return normalizePrenomValue(kept.join(' '));
}

function prenomFromNamesField(namesRaw, surname) {
  var names = (namesRaw || '').trim();
  if (!names) return '';
  if (names.includes('<<')) {
    var tmp = emptyCINExtract();
    parseMrzLines(names, tmp);
    return pickPrenomAvoidingNom([tmp.prenom], surname) || '';
  }
  return stripSurnameFromGiven(names, surname);
}

/** Prénom depuis libellés CNIE recto (PRENOM / Prénom) — sans MRZ. */
function extractPrenomFromRectoLabels(text, knownNom) {
  if (!text || String(text).trim().length < 4) return '';
  var out = emptyCINExtract();
  parseMoroccanNameLabels(text, out);
  return pickPrenomAvoidingNom([out.prenom], knownNom) || '';
}

/** Champs Mindee « prénom » uniquement — jamais surname / last_name. */
function pickMindeeGivenNames(f, knownSurname) {
  if (!f || typeof f !== 'object') return '';
  var sur = cleanNamePart(
    knownSurname || pickMindeeValue(f.surnames || f.surname || f.last_name || f.family_name),
    true,
  );

  var sources = [
    pickMindeeValue(f.given_names),
    pickMindeeValue(f.given_name),
    pickMindeeValue(f.first_name),
    pickMindeeValue(f.first_names),
    pickMindeeValue(f.id_first_name),
    pickMindeeValue(f.id_given_names),
    pickMindeeValue(f.prenom),
    prenomFromNamesField(pickMindeeValue(f.names), sur),
    pickMindeeValue(f.forenames),
  ];

  for (var si = 0; si < sources.length; si++) {
    var val = sources[si];
    if (!val) continue;
    var g = stripSurnameFromGiven(val, sur);
    if (!g || !isValidPersonName(g, true)) continue;
    if (sur && namesEqual(g, sur)) continue;
    return g;
  }

  var full = pickMindeeValue(f.full_name || f.complete_name || f.name);
  if (full && sur) {
    var fromFull = givenFromFullName(full, sur);
    fromFull = stripSurnameFromGiven(fromFull, sur);
    if (fromFull && isValidPersonName(fromFull, true) && !namesEqual(fromFull, sur)) {
      return fromFull;
    }
  }
  return '';
}

function mindeePrenomRawSnapshot(fields) {
  if (!fields || typeof fields !== 'object') return null;
  var f = normalizeMindeeFieldMap(fields);
  var mrzParts = [
    pickMindeeValue(f.mrz_line_1 || f.mrz_line1),
    pickMindeeValue(f.mrz_line_2 || f.mrz_line2),
    pickMindeeValue(f.mrz_line_3 || f.mrz_line3),
    pickMindeeValue(f.mrz),
  ].filter(Boolean);
  return {
    raw_given_names: pickMindeeValue(f.given_names) || null,
    raw_given_name: pickMindeeValue(f.given_name) || null,
    raw_first_name: pickMindeeValue(f.first_name) || null,
    raw_surname: pickMindeeValue(f.surnames || f.surname || f.last_name) || null,
    raw_surname_recto: pickMindeeValue(f.surnames || f.surname || f.last_name) || null,
    raw_names: pickMindeeValue(f.names || f.name) || null,
    raw_mrz: mrzParts.length ? mrzParts.join(' | ') : null,
  };
}

function pickPrenomAvoidingNom(candidates, knownNom) {
  var nomUp = (knownNom || '').trim().toUpperCase();
  var filtered = [];
  for (var i = 0; i < (candidates || []).length; i++) {
    var c = candidates[i];
    if (!c || !String(c).trim()) continue;
    var p = normalizePrenomValue(c);
    if (!isValidPersonName(p, true)) continue;
    if (nomUp && namesEqual(p, nomUp)) continue;
    filtered.push(p);
  }
  return pickBestPersonName(filtered, true);
}

export function isValidPersonName(raw, isPrenom) {
  var v = cleanNamePart(raw, !isPrenom);
  if (!v || v.length < 2 || v.length > 40) return false;
  if (isNameLabelLine(v)) return false;
  if (LABEL_FRAGMENT_RE.test(v)) return false;
  if (MRZ_COUNTRY_CODE_RE.test(v)) return false;
  if (/^(ROYAUME|MAROC|MAROCAINE|CARTE|IDENTITE|NATIONAL|VALABLE|IDMAR|CNIE|CIN|KINGDOM|DOMICILE|ADRESSE|SEXE|F|M)$/i.test(v)) return false;
  if (/\d/.test(v)) return false;
  if (/^[A-Z]{1,2}$/.test(v)) return false;
  return /^[A-Za-zÀ-ÿ\s\-']+$/.test(v);
}

function isMrzSurnameToken(raw) {
  var v = String(raw || '').replace(/[^A-Z]/g, '').toUpperCase();
  if (v.length < 2 || v.length > 30) return false;
  if (/^IDMAR|^I<MAR|^IDMRC|^I<MRC/.test(v)) return false;
  if (MRZ_COUNTRY_CODE_RE.test(v)) return false;
  if (/^\d/.test(v)) return false;
  if (STREET_HINT_RE.test(v) || MOROCCO_PLACE_RE.test(v)) return false;
  if (/^(RUE|RES|AV|BD|BLOC|LOT|HAY|APT|APP|NUM|DOMICILE|ADRESSE)/.test(v)) return false;
  return /^[A-Z]+$/.test(v);
}

function isMrzGivenToken(raw) {
  var v = String(raw || '').replace(/</g, ' ').replace(/[^A-Za-z\s\-']/g, ' ').replace(/\s+/g, ' ').trim();
  return v.length >= 2 && /[A-Za-z]{2,}/.test(v) && isValidPersonName(v, true);
}

function scorePersonName(raw, isPrenom) {
  if (!isValidPersonName(raw, isPrenom)) return -1;
  var v = isPrenom ? normalizePrenomValue(raw) : cleanNamePart(raw, true);
  var score = v.length;
  if (v.includes(' ')) score += 2;
  if (isPrenom && /^[A-Z][a-z]/.test(v)) score += 1;
  if (!isPrenom && v === v.toUpperCase()) score += 1;
  return score;
}

function pickBestPersonName(candidates, isPrenom) {
  var best = '';
  var bestScore = -1;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (!c) continue;
    var score = scorePersonName(c, isPrenom);
    if (score > bestScore) {
      bestScore = score;
      best = isPrenom ? normalizePrenomValue(c) : cleanNamePart(c, true);
    }
  }
  return best;
}

/** Parse tout le texte OCR (recto+verso) pour compléter nom/prénom/CIN/dates. */
export function extractIdentityFromText(text) {
  var out = emptyCINExtract();
  if (!text || String(text).trim().length < 4) return out;
  parseMrzLines(text, out);
  parseMoroccanNameLabels(text, out);
  parseCINDateLabels(text, out);
  var lines = String(text).split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  inferNamesFromLines(lines, out);
  if (!out.numero_cin) {
    var cm = String(text).toUpperCase().match(/([A-Z]{1,3}\d{4,8})/);
    if (cm) out.numero_cin = normCIN(cm[1]);
  }
  return out;
}

/** Extrait nom/prénom depuis la bande MRZ uniquement. */
export function extractMrzIdentity(text) {
  var out = emptyCINExtract();
  parseMrzLines(text, out);
  return {
    nom: cleanNamePart(out.nom, true),
    prenom: normalizePrenomValue(out.prenom),
    numero_cin: normCIN(out.numero_cin),
    date_naissance: out.date_naissance,
    date_expiration: out.date_expiration,
    sexe: out.sexe,
    nationalite: out.nationalite,
  };
}

/**
 * Résolution unique nom/prénom — agrège toutes les sources OCR.
 * @param {object} opts
 * @param {Array<object>} opts.extracts — extractions partielles (Mindee, Tesseract…)
 * @param {string} opts.combinedText — texte OCR brut concaténé
 * @param {object} [opts.base] — champs déjà fusionnés (CIN, dates, adresse…)
 */
export function resolveCINIdentity(opts) {
  var extracts = (opts?.extracts || []).filter(Boolean);
  var base = { ...emptyCINExtract(), ...(opts?.base || {}) };
  var combinedText = opts?.combinedText || '';
  var mindeeRectoFields = opts?.mindeeRectoFields || null;
  var mindeeVersoFields = opts?.mindeeVersoFields || null;

  var mindeeRectoActive = opts?.mindeeRectoActive !== false;
  var rectoSnap = mindeePrenomRawSnapshot(mindeeRectoFields);
  var surMindee = rectoSnap ? cleanNamePart(rectoSnap.raw_surname_recto || rectoSnap.raw_surname, true) : '';

  var mrz = extractMrzIdentity(combinedText);
  var fromText = extractIdentityFromText(combinedText);
  var dates = extractDatesFromText(combinedText);

  var nomCandidates = [];

  function pushNom(e, priority) {
    if (!e || !e.nom) return;
    nomCandidates.push({ v: e.nom, p: priority });
  }

  pushNom(mrz, 100);
  pushNom(fromText, 90);
  extracts.forEach(function(e, i) {
    pushNom(e, 90 - i);
  });
  pushNom(base, 85);

  function pickWeightedNom(list) {
    var best = '';
    var bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var nameScore = scorePersonName(item.v, false);
      if (nameScore < 0) continue;
      var total = nameScore + (item.p || 0);
      if (total > bestScore) {
        bestScore = total;
        best = cleanNamePart(item.v, true);
      }
    }
    return best;
  }

  var nom = pickWeightedNom(nomCandidates);
  if (surMindee && isValidPersonName(surMindee, false)) {
    nom = surMindee;
  } else if (!mindeeRectoActive && isValidPersonName(mrz.nom, false)) {
    nom = cleanNamePart(mrz.nom, true);
  }

  var prenomTrace = {
    raw_given_names_recto: null,
    raw_given_name_recto: null,
    raw_first_name_recto: null,
    raw_surname_recto: null,
    raw_names_recto: null,
    raw_mrz: null,
    prenom_final: '',
    source: 'none',
  };

  if (rectoSnap) {
    prenomTrace.raw_given_names_recto = rectoSnap.raw_given_names;
    prenomTrace.raw_given_name_recto = rectoSnap.raw_given_name;
    prenomTrace.raw_first_name_recto = rectoSnap.raw_first_name;
    prenomTrace.raw_surname_recto = rectoSnap.raw_surname_recto || rectoSnap.raw_surname;
    prenomTrace.raw_names_recto = rectoSnap.raw_names;
  }

  var nomRef = surMindee || nom;
  var rectoText = opts?.rectoText || '';
  var versoText = opts?.versoText || '';
  var rectoExtracts = opts?.rectoExtracts || extracts.slice(0, 3);
  var versoExtracts = opts?.versoExtracts || extracts.slice(3, 6);
  var mindeeVersoActive = opts?.mindeeVersoActive !== false;
  var prenom = '';

  function trySetPrenom(candidate, source) {
    var p = pickPrenomAvoidingNom([candidate], nomRef);
    if (!p) return false;
    prenom = p;
    prenomTrace.source = source;
    return true;
  }

  if (mindeeRectoActive && mindeeRectoFields) {
    var fromRectoMindee = pickMindeeGivenNames(normalizeMindeeFieldMap(mindeeRectoFields), surMindee || nom);
    trySetPrenom(fromRectoMindee, 'mindee_recto_explicit');
  }

  if (!prenom && rectoText) {
    var fromLabels = extractPrenomFromRectoLabels(rectoText, nomRef);
    trySetPrenom(fromLabels, 'recto_label');
  }

  if (!prenom && base.prenom) {
    trySetPrenom(stripSurnameFromGiven(base.prenom, nomRef), 'base_merge_recto');
  }

  if (!prenom) {
    for (var ri = 0; ri < rectoExtracts.length; ri++) {
      var ex = rectoExtracts[ri];
      if (trySetPrenom(stripSurnameFromGiven(ex?.prenom, nomRef), 'recto_extract_' + ri)) break;
    }
  }

  if (!prenom && mindeeVersoFields) {
    var versoSnap = mindeePrenomRawSnapshot(mindeeVersoFields);
    if (versoSnap?.raw_mrz) prenomTrace.raw_mrz = versoSnap.raw_mrz;
    var mrzOnly = emptyCINExtract();
    parseMrzLines(versoSnap?.raw_mrz || '', mrzOnly);
    trySetPrenom(mrzOnly.prenom, 'mrz_verso');
    if (!prenomTrace.raw_mrz && versoSnap?.raw_mrz) prenomTrace.raw_mrz = versoSnap.raw_mrz;
  }

  if (!prenom && versoText) {
    var mrzVersoTess = extractMrzIdentity(versoText);
    if (trySetPrenom(mrzVersoTess.prenom, 'mrz_verso_tesseract')) {
      prenomTrace.raw_mrz = prenomTrace.raw_mrz || versoText.slice(0, 120);
    }
  }

  if (!prenom && isValidPersonName(mrz.prenom, true)) {
    if (trySetPrenom(mrz.prenom, 'mrz_combined')) {
      prenomTrace.raw_mrz = prenomTrace.raw_mrz || ('prenom=' + mrz.prenom + ';nom=' + (mrz.nom || ''));
    }
  }

  if (!prenom) {
    var fromLabelText = extractPrenomFromRectoLabels(combinedText, nomRef);
    if (!fromLabelText && isValidPersonName(fromText.prenom, true)) {
      fromLabelText = pickPrenomAvoidingNom([stripSurnameFromGiven(fromText.prenom, nomRef)], nomRef);
    }
    trySetPrenom(fromLabelText, 'ocr_text');
  }

  prenomTrace.prenom_final = prenom || '';
  logPrenomResolution(prenomTrace);

  var MRZ_FIRST_KEYS = ['numero_cin', 'date_naissance', 'date_expiration', 'sexe', 'nationalite'];

  function pickField(key) {
    if (MRZ_FIRST_KEYS.indexOf(key) >= 0) {
      if (mrz[key] && String(mrz[key]).trim()) return mrz[key];
      if (dates[key] && String(dates[key]).trim()) return dates[key];
      if (fromText[key] && String(fromText[key]).trim()) return fromText[key];
      if (base[key] && String(base[key]).trim()) return base[key];
      for (var j = 0; j < extracts.length; j++) {
        if (extracts[j][key] && String(extracts[j][key]).trim()) return extracts[j][key];
      }
      return '';
    }
    if (base[key] && String(base[key]).trim()) return base[key];
    if (dates[key] && String(dates[key]).trim()) return dates[key];
    if (mrz[key] && String(mrz[key]).trim()) return mrz[key];
    if (fromText[key] && String(fromText[key]).trim()) return fromText[key];
    for (var i = 0; i < extracts.length; i++) {
      if (extracts[i][key] && String(extracts[i][key]).trim()) return extracts[i][key];
    }
    return '';
  }

  var addrResolved = resolveCINAddress({
    mindeeVersoFields: mindeeVersoActive ? mindeeVersoFields : null,
    versoText,
    versoExtracts,
    base,
  });

  const resolved = sanitizeCINExtract({
    ...base,
    numero_cin: normCIN(pickField('numero_cin')),
    nom,
    prenom,
    date_naissance: normDateISO(pickField('date_naissance')),
    date_expiration: normDateISO(pickField('date_expiration')),
    sexe: pickField('sexe'),
    nationalite: pickField('nationalite'),
    lieu_naissance: pickField('lieu_naissance'),
    adresse: addrResolved.adresse,
    ville_adresse: addrResolved.ville_adresse,
    complement_adresse: addrResolved.complement_adresse,
    pays: addrResolved.pays,
  });
  resolved._prenom_resolution_source = prenomTrace.source;
  resolved._adresse_resolution_source = addrResolved.source || 'none';
  return resolved;
}

/** @deprecated — utiliser resolveCINIdentity */
export function finalizeCINIdentity(merged, sources) {
  return resolveCINIdentity({
    base: merged,
    extracts: [sources?.recto, sources?.verso].filter(Boolean),
    combinedText: sources?.combinedText || '',
  });
}

export function identityFieldsComplete(extract) {
  var e = { ...emptyCINExtract(), ...(extract || {}) };
  return Boolean(
    isValidPersonName(e.nom, false)
    && isValidPersonName(e.prenom, true)
    && (isValidCINNumber(e.numero_cin) || String(e.numero_cin || '').trim().length >= 4),
  );
}

function splitNomPrenomOneLine(raw, out) {
  var m = (raw || '').match(
    /(?:NOM|N[O0]M)\s*[:\.]?\s*([A-ZÀ-Ü][A-ZÀ-Ü\s'\-]{1,35}?)\s+(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM|PRE\s*NOM)\s*[:\.]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'\-]{1,35})/i,
  );
  if (!m) return;
  if (!out.nom) out.nom = cleanNamePart(m[1], true);
  if (!out.prenom) out.prenom = normalizePrenomValue(m[2]);
}

function titleCaseName(raw) {
  return (raw || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
    .join(' ');
}

function parseMrzDate(yymmdd) {
  if (!yymmdd || yymmdd.length < 6) return '';
  var yy = parseInt(yymmdd.slice(0, 2), 10);
  var mm = yymmdd.slice(2, 4);
  var dd = yymmdd.slice(4, 6);
  var year = yy >= 30 ? 1900 + yy : 2000 + yy;
  return year + '-' + mm + '-' + dd;
}

/** Normalise le texte OCR autour de la MRZ (espaces parasites, chevrons) — conserve les lignes. */
export function normalizeMrzOcrText(raw) {
  return String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(function(line) {
      return line
        .replace(/[«»]/g, '<')
        .replace(/\s*<\s*</g, '<<')
        .replace(/([A-Za-z]{2,})<\s+([A-Za-z])/g, '$1<<$2')
        .replace(/[^\S\n]+/g, ' ')
        .trim();
    })
    .filter(Boolean)
    .join('\n');
}

/** Extrait nom/prénom depuis une ligne contenant << (évite d'absorber l'adresse sur la même ligne). */
function parseMrzNameOnLine(line, out) {
  if (!line || !line.includes('<<') || MRZ_DATE_LINE_RE.test(line)) return false;

  var idx = line.lastIndexOf('<<');
  var before = line.slice(0, idx);
  var after = line.slice(idx + 2);
  var surMatch = before.match(/([A-Z]{2,24})$/);
  if (!surMatch) return false;

  var surname = fixMrzSurnameToken(surMatch[1]);
  var givenRaw = fixMrzGivenToken(after);
  if (!isMrzSurnameToken(surname) || !isMrzGivenToken(givenRaw)) return false;

  if (!out.nom || !isValidPersonName(out.nom, false)) out.nom = surname;
  if (!out.prenom || !isValidPersonName(out.prenom, true)) out.prenom = titleCaseName(givenRaw);
  return true;
}

function fixMrzSurnameToken(raw) {
  return fixOcrNameChars(String(raw || '')).replace(/[^A-Z]/g, '').toUpperCase();
}

function fixMrzGivenToken(raw) {
  return fixOcrNameChars(String(raw || '').replace(/</g, ' '))
    .replace(/[^A-Za-z\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse nom<<prénom ligne par ligne (évite de fusionner adresse + MRZ). */
function extractMrzFromBlob(raw, out) {
  var normalized = normalizeMrzOcrText(raw);
  var lines = normalized.split('\n').map(function(l) {
    return l.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9<]/g, '');
  }).filter(function(l) { return l.length >= 8; });

  for (var li = 0; li < lines.length; li++) {
    if (parseMrzNameOnLine(lines[li], out)) break;
  }

  var compact = lines.join('\n');
  if (!out.numero_cin) {
    for (var i = 0; i < lines.length; i++) {
      if (!/^IDMAR|^I<MAR/.test(lines[i])) continue;
      var docM = lines[i].match(/IDMAR([A-Z]{1,3}\d{4,8})/) || lines[i].match(/([A-Z]{1,3}\d{4,8})/);
      if (docM) { out.numero_cin = normCIN(docM[1] || docM[0]); break; }
    }
  }

  if (!out.date_naissance || !out.date_expiration) {
    parseMrzDatesLoose(compact, out);
  }
}

function parseMrzFlexible(raw, out) {
  var lines = String(raw || '').split('\n');
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9<]/g, '');
    if (!line || line.length < 10) continue;
    if (/^IDMAR|^I<MAR|^IDMRC|^I<MRC/.test(line)) continue;
    if (MRZ_DATE_LINE_RE.test(line)) continue;
    if (!line.includes('<<')) continue;
    parseMrzNameOnLine(line, out);
  }
}

function parseMrzLines(raw, out) {
  var text = normalizeMrzOcrText(raw);
  extractMrzFromBlob(text, out);
  parseMrzFlexible(text, out);
  var lines = text.split('\n').map(function(l) {
    return l.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9<]/g, '');
  }).filter(function(l) { return l.length >= 10; });

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (/^IDMAR|^I<MAR|^IDMRC|^I<MRC/.test(line)) {
      var docM = line.match(/IDMAR([A-Z]{1,3}\d{4,8})/) || line.match(/([A-Z]{1,3}\d{4,8})/);
      if (docM && !out.numero_cin) out.numero_cin = normCIN(docM[1] || docM[0]);
      continue;
    }

    if (line.includes('<<') && !MRZ_DATE_LINE_RE.test(line)) {
      parseMrzNameOnLine(line, out);
      continue;
    }

    if (MRZ_DATE_LINE_RE.test(line)) {
      if (!out.date_naissance) out.date_naissance = parseMrzDate(line.slice(0, 6));
      if (!out.sexe) {
        var sx = line.charAt(7);
        if (sx === 'M') out.sexe = 'M';
        else if (sx === 'F') out.sexe = 'F';
      }
      if (!out.date_expiration) out.date_expiration = parseMrzDate(line.slice(8, 14));
      if (!out.nationalite && line.includes('MAR')) out.nationalite = 'MAROC';
    }
  }
  parseMrzDatesLoose(text, out);
}

/** Extrait nom/prénom depuis labels CNIE marocaine (recto). */
function parseMoroccanNameLabels(raw, out) {
  splitNomPrenomOneLine(raw, out);

  var lines = (raw || '').split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  function tryNextLines(startIdx, key, upper) {
    for (var j = startIdx + 1; j < Math.min(startIdx + 5, lines.length); j++) {
      if (isNameLabelLine(lines[j])) continue;
      var next = key === 'prenom'
        ? normalizePrenomValue(lines[j])
        : cleanNamePart(lines[j], upper);
      if (next && isValidPersonName(next, key === 'prenom')) {
        if (key === 'prenom' && out.nom && next.toUpperCase() === out.nom.toUpperCase()) continue;
        out[key] = next;
        return true;
      }
    }
    return false;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var nomInline = line.match(NOM_INLINE_RE);
    if (nomInline && (!out.nom || !isValidPersonName(out.nom, false))) {
      var nomVal = cleanNamePart(nomInline[1].split(/\s+(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM)/i)[0], true);
      if (nomVal && isValidPersonName(nomVal, false)) out.nom = nomVal;
    }
    if (!out.nom && isNomLabelLine(line)) {
      tryNextLines(i, 'nom', true);
    }

    var preInline = line.match(PRENOM_INLINE_RE);
    if (preInline && (!out.prenom || !isValidPersonName(out.prenom, true))) {
      var pr = normalizePrenomValue(preInline[1]);
      if (pr && isValidPersonName(pr, true)) out.prenom = pr;
    }
    if (!out.prenom && isPrenomLabelLine(line)) {
      tryNextLines(i, 'prenom', false);
    }
  }

  if (!out.nom) {
    var inlineNom = raw.match(/(?:NOM|N[O0]M)\s*[:\.\-]?\s*([A-ZÀ-Ü][A-ZÀ-Ü\s'\-]{1,35})/i);
    if (inlineNom) {
      var nInline = cleanNamePart(inlineNom[1].split(/\s+(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM)/i)[0], true);
      if (nInline && isValidPersonName(nInline, false)) out.nom = nInline;
    }
  }
  if (!out.prenom) {
    var inlinePre = raw.match(/(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM|PRE\s*NOM)\s*[:\.\-]?\s*([^\n]{1,40})/i);
    if (inlinePre) {
      var pInline = normalizePrenomValue(inlinePre[1]);
      if (pInline && isValidPersonName(pInline, true)) out.prenom = pInline;
    }
  }
}

function inferNamesFromLines(lines, out) {
  var skipRe = /^(ROYAUME|MAROC|MAROCAINE|CARTE|IDENTITE|NATIONAL|VALABLE|NEE|NÉE|DATE|LIEU|SEXE|CNIE|CIN|N[°O]|NUM|DOMICILE|ADRESSE|FILIATION|FAMILLE|KINGDOM|IDMAR)/i;
  var latinUpper = [];
  var latinMixed = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.length < 2 || skipRe.test(line) || isNameLabelLine(line)) continue;
    var fixed = fixOcrNameChars(line);
    if (/^[A-Z][A-Z\s\-']{1,38}$/.test(fixed) && !/\d/.test(fixed)) {
      latinUpper.push(fixed);
    } else if (/^[A-Z][a-zàâäéèêëïîôùûüç\-']+(?:\s+[A-Za-zàâäéèêëïîôùûüç\-']+)*$/.test(fixed)) {
      latinMixed.push(fixed);
    }
  }
  if (!out.nom && latinUpper.length > 0) {
    var nomPick = latinUpper.find(function(l) {
      return isValidPersonName(l, false) && l.length >= 3 && l.length <= 24;
    });
    if (nomPick) out.nom = nomPick.toUpperCase();
  }
  if (!out.prenom) {
    if (latinMixed.length > 0) {
      var prePick = latinMixed.find(function(l) { return isValidPersonName(l, true); });
      if (prePick) out.prenom = normalizePrenomValue(prePick);
    } else {
      var nomUp = (out.nom || '').toUpperCase();
      var preCandidate = latinUpper.find(function(l) {
        return isValidPersonName(l, true) && l.toUpperCase() !== nomUp && l.length >= 2 && l.length <= 24;
      });
      if (preCandidate) out.prenom = normalizePrenomValue(preCandidate);
    }
  }
}

export function mapTesseractText(text, side = 'recto') {
  var raw = (text || '').replace(/\r/g, '');
  var upper = raw.toUpperCase();
  var out = emptyCINExtract();

  parseMrzLines(raw, out);
  parseMoroccanNameLabels(raw, out);
  parseCINDateLabels(raw, out);

  var cinPatterns = [
    /\b([A-Z]{1,3})\s*(\d{4,8})\b/i,
    /\b([A-Z]{2}\d{5,8})\b/i,
    /(?:N[°O]|NO|NUM(?:ERO)?|CIN|CNIE)\s*[:\.]?\s*([A-Z]{1,3}\s*\d{4,8})/i,
  ];
  for (var p = 0; p < cinPatterns.length; p++) {
    var m = raw.match(cinPatterns[p]);
    if (m) {
      out.numero_cin = normCIN((m[1] || '') + (m[2] || ''));
      if (out.numero_cin) break;
    }
  }
  if (!out.numero_cin) {
    var cm = upper.match(/([A-Z]{1,3}\d{4,8})/);
    if (cm) out.numero_cin = normCIN(cm[1]);
  }

  var birthM = raw.match(BIRTH_INLINE_RE);
  if (birthM && !out.date_naissance) out.date_naissance = parseDateToken(birthM[1]);

  var expM = raw.match(EXPIRY_INLINE_RE);
  if (expM && !out.date_expiration) out.date_expiration = parseDateToken(expM[1]);

  if (/\bMASCULIN\b|\bSEXE\s*:?\s*M\b|\bMR\b/i.test(raw)) out.sexe = 'M';
  else if (/\bFEMININ\b|\bFEMININE\b|\bSEXE\s*:?\s*F\b|\bMME\b/i.test(raw)) out.sexe = 'F';
  if (/MAROC|MAROCAINE|المغرب/i.test(raw)) out.nationalite = 'MAROC';

  var lines = raw.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var nomInline = line.match(/^(?:NOM|N[O0]M|SURNAM?E|الاسم\s*العائلي)\s*[:\.\-]?\s*(.+)$/i);
    if (nomInline) {
      var n = cleanNamePart(nomInline[1].split(/\s+(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM)/i)[0], true);
      if (n && isValidPersonName(n, false)) out.nom = n;
    } else if (isNomLabelLine(line) && lines[i + 1]) {
      var n2 = cleanNamePart(lines[i + 1], true);
      if (n2 && isValidPersonName(n2, false)) out.nom = n2;
    }

    var prenomInline = line.match(/^(?:PR[EÉÈÊ]?N[O0Q]?M|PRNOM|PRENOM|GIVEN\s*NAM?ES?|FIRST\s*NAM?E|الاسم\s*الشخصي)\s*[:\.\-]?\s*(.+)$/i);
    if (prenomInline) {
      var pr = normalizePrenomValue(prenomInline[1]);
      if (pr && isValidPersonName(pr, true)) out.prenom = pr;
    } else if (isPrenomLabelLine(line) && lines[i + 1]) {
      var pr2 = normalizePrenomValue(lines[i + 1]);
      if (pr2 && isValidPersonName(pr2, true)) out.prenom = pr2;
    }

    var lieuM = line.match(/(?:NE\s*(?:E|É)\s*(?:A|À|LE)|LIEU\s*DE\s*NAISSANCE|BORN\s*(?:IN|AT))\s*[:\.]?\s*(.+)$/i);
    if (lieuM && !out.lieu_naissance) out.lieu_naissance = cleanNamePart(lieuM[1], true);

    if (side === 'verso') {
      var addrM = line.match(/(?:ADRESSE|ADDRESS|DOMICILE)\s*[:\.]?\s*(.+)$/i);
      if (addrM) {
        const a = cleanAddressLine(addrM[1]);
        if (a) out.adresse = (out.adresse ? out.adresse + ' ' : '') + a;
      } else if (!isMrzNoiseLine(line) && (/^\d/.test(line) || /\bRUE\b|\bRES\b|\bAV\b|\bBD\b|\bAPT\b|\bBOURGOGNE\b|\bCASABLANCA\b/i.test(line))) {
        const a = cleanAddressLine(line);
        if (a.length >= 6) out.adresse = (out.adresse ? out.adresse + ' ' : '') + a;
      }
      var cityM = line.match(/(?:VILLE|CITY)\s*[:\.]?\s*(.+)$/i);
      if (cityM) out.ville_adresse = cleanAddressLine(cityM[1]);
    }
  }

  if (side === 'recto') inferNamesFromLines(lines, out);

  if (side === 'verso') {
    const parsedAddr = extractVersoAddressFromText(raw);
    const adresse = (parsedAddr || out.adresse || '').trim();
    return sanitizeCINExtract({
      ...emptyCINExtract(),
      adresse,
      ville_adresse: (out.ville_adresse || '').trim(),
      complement_adresse: out.complement_adresse || '',
    });
  }
  return sanitizeCINExtract(out);
}

export function mergeSideExtracts(primary, secondary, side = 'recto') {
  const p = { ...emptyCINExtract(), ...(primary || {}) };
  const s = { ...emptyCINExtract(), ...(secondary || {}) };
  const pick = (k) => {
    if (p[k] && String(p[k]).trim()) return p[k];
    if (s[k] && String(s[k]).trim()) return s[k];
    return '';
  };
  function pickNamePreferPrimary(isPrenom) {
    var pVal = p[isPrenom ? 'prenom' : 'nom'];
    if (isPrenom && isValidPersonName(pVal, true)) return normalizePrenomValue(pVal);
    if (!isPrenom && isValidPersonName(pVal, false)) return cleanNamePart(pVal, true);
    return pickBestPersonName([s[isPrenom ? 'prenom' : 'nom'], pVal], isPrenom);
  }
  const nom = pickNamePreferPrimary(false);
  const prenom = pickNamePreferPrimary(true);
  if (side === 'verso') {
    const adresse = pickBestAddress([p.adresse, s.adresse]);
    return sanitizeCINExtract({
      ...emptyCINExtract(),
      adresse,
      ville_adresse: pick('ville_adresse'),
      complement_adresse: pick('complement_adresse'),
      pays: pick('pays'),
    });
  }
  return sanitizeCINExtract({
    numero_cin: pick('numero_cin'),
    prenom,
    nom,
    date_naissance: pick('date_naissance'),
    lieu_naissance: pick('lieu_naissance'),
    date_expiration: pick('date_expiration'),
    sexe: pick('sexe'),
    nationalite: pick('nationalite'),
    confidence: Math.max(p.confidence || 0, s.confidence || 0),
  });
}

export function parseMRZFromText() {
  return emptyCINExtract();
}

export function countIdentityFields(extract) {
  const e = { ...emptyCINExtract(), ...(extract || {}) };
  return ['numero_cin', 'prenom', 'nom', 'date_naissance'].filter((k) => e[k] && String(e[k]).trim()).length;
}

export function isLikelyParentEntry() {
  return false;
}
