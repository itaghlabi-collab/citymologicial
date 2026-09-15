/**
 * articleMovementRules.js — Règles types d’article ↔ types de mouvement (inventaire).
 * Valeurs techniques alignées sur stock_articles.article_type / TYPES_ARTICLE_STOCK.
 */
export const ARTICLE_TYPE_MATERIEL = 'Matériel';
export const ARTICLE_TYPE_OUTIL = 'Outil';
export const ARTICLE_TYPE_CONSOMMABLE = 'Consommable';

export const ARTICLE_TYPES_STOCK = [
  ARTICLE_TYPE_MATERIEL,
  ARTICLE_TYPE_OUTIL,
  ARTICLE_TYPE_CONSOMMABLE,
];

const SORTIE_BLOCKED_TYPES = new Set([
  ARTICLE_TYPE_MATERIEL.toLowerCase(),
  ARTICLE_TYPE_OUTIL.toLowerCase(),
  'materiel',
  'outil',
  'outillage',
]);

/**
 * Normalise le type technique d’un article (article_type / type).
 * @returns {'Matériel'|'Outil'|'Consommable'|string}
 */
export function normalizeArticleType(articleOrType) {
  const raw = typeof articleOrType === 'string'
    ? articleOrType
    : (articleOrType?.article_type || articleOrType?.type || '');
  const t = String(raw || '').trim();
  if (!t) return '';
  const key = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key === 'materiel' || key === 'material') return ARTICLE_TYPE_MATERIEL;
  if (key === 'outil' || key === 'tool' || key === 'outillage') return ARTICLE_TYPE_OUTIL;
  if (key === 'consommable' || key === 'consumable') return ARTICLE_TYPE_CONSOMMABLE;
  // Conserve la casse métier connue
  if (t === ARTICLE_TYPE_MATERIEL || t === ARTICLE_TYPE_OUTIL || t === ARTICLE_TYPE_CONSOMMABLE) return t;
  return t;
}

/**
 * @param {*} articleOrType
 * @param {{ allowMaterielSortie?: boolean }} [options]
 *   Exception : Sortie / Rebut Matériel / Outil autorisés (ex. super_admin
 *   en Mouvement rapide / régularisation). Hors ce flag, outils bloqués sauf
 *   livraison demande chantier (allowSiteRequestDeliverySortie).
 */
export function articleAllowsStandardSortie(articleOrType, options = {}) {
  const normalized = normalizeArticleType(articleOrType);
  if (!normalized) return true; // type inconnu : UI permissive ; backend ne bloque que Matériel/Outil connus
  const key = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const blocked = SORTIE_BLOCKED_TYPES.has(key) || SORTIE_BLOCKED_TYPES.has(normalized.toLowerCase());
  if (!blocked) return true;
  // Flag super_admin : débloque Matériel et Outil (y compris alias outillage).
  if (
    options.allowMaterielSortie
    && (normalized === ARTICLE_TYPE_MATERIEL || normalized === ARTICLE_TYPE_OUTIL)
  ) {
    return true;
  }
  return false;
}

/** Types de mouvement UI autorisés pour un article. */
export function allowedMovementTypesForArticle(articleOrType, options = {}) {
  if (articleAllowsStandardSortie(articleOrType, options)) {
    return ['Entrée', 'Transfert', 'Sortie'];
  }
  return ['Entrée', 'Transfert'];
}

export const SORTIE_BLOCKED_MESSAGE =
  'Une sortie standard n’est pas autorisée pour un matériel ou un outil. Utilisez un transfert.';

export const SORTIE_CLEARED_HINT =
  'Le mouvement Sortie n’est pas autorisé pour un matériel ou un outil. Sélectionnez Entrée ou Transfert.';

export const ARTICLE_CLEARED_FOR_SORTIE_HINT =
  'Cet article n’est pas disponible pour une sortie. Sélectionnez un consommable.';

export const ARTICLE_CLEARED_FOR_SORTIE_HINT_WITH_MATERIEL =
  'Cet article n’est pas disponible pour une sortie. Sélectionnez un consommable, un matériel ou un outil.';

/** UI : un article est-il autorisé pour ce type de mouvement ? */
export function articleAllowedForMovementType(articleOrType, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (!type) return false;
  return allowedMovementTypesForArticle(articleOrType, options).includes(type);
}

/** UI : filtre la liste d’articles selon le type de mouvement choisi. */
export function filterArticlesForMovementType(articles, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (!type) return [];
  return (articles || []).filter((a) => articleAllowedForMovementType(a, type, options));
}

/**
 * Lève une erreur VALIDATION si Sortie + Matériel/Outil.
 * @param {{ allowSiteRequestDeliverySortie?: boolean, allowMaterielSortie?: boolean }} [options]
 *   allowSiteRequestDeliverySortie : livraison demande chantier (Matériel + Outil).
 *   allowMaterielSortie : Sortie / Rebut Matériel + Outil (ex. super_admin régularisation / MR).
 */
export function assertMovementAllowedForArticle(articleOrType, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (type !== 'Sortie' && type !== 'Rebut') return;
  if (options.allowSiteRequestDeliverySortie) return;
  const normalized = normalizeArticleType(articleOrType);
  if (!normalized) return; // type inconnu : ne bloque pas (données historiques)
  if (!articleAllowsStandardSortie(normalized, options)) {
    const err = new Error(SORTIE_BLOCKED_MESSAGE);
    err.code = 'VALIDATION';
    throw err;
  }
}
