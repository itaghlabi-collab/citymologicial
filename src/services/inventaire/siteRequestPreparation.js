/**
 * Bon de préparation — sélection d'articles disponibles (catalogue stock × emplacement).
 * Lecture seule : aucune déduction, réservation ni demande d'achat.
 */

const DEPRECATED_EMPLACEMENTS = ['F5', 'G3', 'F2'];
const SOURCE_PREFIX = /^\[Source:\s*([^\]]+)\]\s*/i;

function isDeprecatedEmplacement(value) {
  const k = String(value || '').trim().toUpperCase();
  return DEPRECATED_EMPLACEMENTS.some((d) => d.toUpperCase() === k);
}

export function isPreparationBon(req) {
  if (req?.origine === 'bon_preparation') return true;
  const lines = (req?.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
  if (!lines.length) return false;
  return lines.every((l) => l.article_id && decodeSourceEmplacement(l.remarque, l.emplacement_source).emplacement);
}

export function preparationOfferKey(articleId, emplacement) {
  return `${String(articleId || '').trim()}|${String(emplacement || '').trim().toLowerCase()}`;
}

export function encodeSourceEmplacement(remarque, emplacement) {
  const cleaned = String(remarque || '').replace(SOURCE_PREFIX, '').trim();
  const emp = String(emplacement || '').trim();
  if (!emp) return cleaned;
  return `[Source: ${emp}]${cleaned ? ` ${cleaned}` : ''}`;
}

export function decodeSourceEmplacement(remarque, fallback = '') {
  const raw = String(remarque || '');
  const m = raw.match(SOURCE_PREFIX);
  return {
    emplacement: m ? String(m[1] || '').trim() : String(fallback || '').trim(),
    remarque: m ? raw.replace(SOURCE_PREFIX, '').trim() : raw.trim(),
  };
}

function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isActiveArticle(article) {
  const s = String(article?.statut || 'Actif').toLowerCase();
  return s === 'actif' || s === 'active';
}

/**
 * Offres = une ligne par article actif × emplacement avec quantité > 0.
 * N'utilise pas le stock global comme quantité disponible.
 */
export function buildPreparationOffers(articles = [], levels = []) {
  const byArticle = new Map();
  (levels || []).forEach((level) => {
    const articleId = String(level.article_id || '');
    const emplacement = String(level.emplacement || '').trim();
    const qty = Number(level.quantite) || 0;
    if (!articleId || !emplacement || qty <= 0 || isDeprecatedEmplacement(emplacement)) return;
    if (!byArticle.has(articleId)) byArticle.set(articleId, []);
    byArticle.get(articleId).push({
      emplacement,
      quantite: qty,
      warehouse_id: level.warehouse_id || null,
    });
  });

  const offers = [];
  (articles || []).forEach((art) => {
    if (!art?.id || !isActiveArticle(art)) return;
    const locRows = byArticle.get(String(art.id)) || [];
    locRows.forEach((loc) => {
      offers.push({
        key: preparationOfferKey(art.id, loc.emplacement),
        article_id: art.id,
        reference: art.reference || art.code || '',
        designation: art.nom || art.designation || '',
        unite: art.unite || 'U',
        article_type: art.article_type || art.type || '',
        category_id: art.categorie_id || art.category_id || '',
        emplacement: loc.emplacement,
        quantite_disponible: loc.quantite,
        stock_global: Number(art.stock_actuel) || 0,
      });
    });
  });

  return offers.sort((a, b) =>
    String(a.designation).localeCompare(String(b.designation), 'fr')
    || String(a.emplacement).localeCompare(String(b.emplacement), 'fr'),
  );
}

export function filterPreparationOffers(offers, { query = '', categoryId = '', articleType = '' } = {}) {
  const q = normalizeSearch(query);
  const tokens = q.split(' ').filter(Boolean);
  return (offers || []).filter((o) => {
    if (categoryId && String(o.category_id) !== String(categoryId)) return false;
    if (articleType && String(o.article_type || '') !== String(articleType)) return false;
    if (!tokens.length) return true;
    const hay = normalizeSearch([o.reference, o.designation, o.emplacement].join(' '));
    return tokens.every((t) => hay.includes(t));
  });
}

export function offerToPreparationLine(offer, order = 0) {
  return {
    category_id: 'autres',
    article_name: offer.designation,
    article_id: offer.article_id,
    reference: offer.reference,
    quantite_demandee: 1,
    quantite_preparee: 0,
    quantite_livree: 0,
    unite: offer.unite || 'U',
    remarque: encodeSourceEmplacement('', offer.emplacement),
    emplacement_source: offer.emplacement,
    quantite_disponible: offer.quantite_disponible,
    is_custom: false,
    line_order: order,
  };
}

export function validatePreparationQuantities(lines, offers = null) {
  const errors = [];
  const offerMap = new Map((offers || []).map((o) => [o.key, o]));
  const seen = new Set();
  (lines || []).forEach((line, idx) => {
    const emp = line.emplacement_source || decodeSourceEmplacement(line.remarque).emplacement;
    const qty = Number(line.quantite_demandee);
    const label = `${line.reference || ''} ${line.article_name || ''}`.trim() || `Ligne ${idx + 1}`;
    if (!line.article_id || line.is_custom) {
      errors.push({ index: idx, label, reason: 'hors_catalogue', message: `${label} : article hors catalogue interdit.` });
      return;
    }
    if (!emp) {
      errors.push({ index: idx, label, reason: 'emplacement', message: `${label} : emplacement source manquant.` });
      return;
    }
    const key = preparationOfferKey(line.article_id, emp);
    if (seen.has(key)) {
      errors.push({ index: idx, label, reason: 'doublon', message: `${label} (${emp}) : ligne en double.` });
      return;
    }
    seen.add(key);
    if (!(qty > 0)) {
      errors.push({ index: idx, label, reason: 'quantite', message: `${label} : la quantité doit être strictement positive.` });
      return;
    }
    if (!offers) return;
    const offer = offerMap.get(key);
    const available = Number(offer?.quantite_disponible);
    if (!offer) {
      errors.push({
        index: idx,
        label,
        emplacement: emp,
        requested: qty,
        available: 0,
        reason: 'indisponible',
        message: `${label} (${emp}) : plus disponible à cet emplacement.`,
      });
      return;
    }
    if (qty > available) {
      errors.push({
        index: idx,
        label,
        emplacement: emp,
        requested: qty,
        available,
        reason: 'insuffisant',
        message: `${label} (${emp}) : demandé ${qty}, disponible ${available}.`,
      });
    }
  });
  return errors;
}

export function formatPreparationConflictMessage(errors = []) {
  if (!errors.length) return '';
  const lines = errors.map((e) => `• ${e.message}`);
  return `Disponibilité actualisée — lignes concernées (quantités non modifiées) :\n${lines.join('\n')}`;
}

export function linesToPreparationPayload(lines) {
  return (lines || []).map((line, idx) => {
    const emp = line.emplacement_source || decodeSourceEmplacement(line.remarque).emplacement;
    return {
      ...line,
      category_id: 'autres',
      is_custom: false,
      article_id: line.article_id,
      article_name: line.article_name,
      quantite_demandee: Number(line.quantite_demandee) || 0,
      quantite_preparee: 0,
      quantite_livree: 0,
      emplacement_source: emp,
      remarque: encodeSourceEmplacement(decodeSourceEmplacement(line.remarque).remarque, emp),
      line_order: idx,
    };
  });
}
