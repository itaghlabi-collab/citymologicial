/**
 * articleMovementRules.js — Règles types d’article ↔ types de mouvement (inventaire).
 * Valeurs techniques alignées sur stock_articles.article_type / TYPES_ARTICLE_STOCK.
 *
 * Non-admin (magasinier et autres) :
 *   - Entrée   → tous types
 *   - Sortie   → Consommable uniquement
 *   - Transfert → Matériel et Outil uniquement
 * Admin (allowMaterielSortie / super_admin) : tous types pour tous mouvements.
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

function isMaterielOrOutil(normalized) {
  return normalized === ARTICLE_TYPE_MATERIEL || normalized === ARTICLE_TYPE_OUTIL;
}

/**
 * @param {*} articleOrType
 * @param {{ allowMaterielSortie?: boolean }} [options]
 *   Exception admin : Sortie / Rebut Matériel / Outil autorisés (ex. super_admin
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
  // Flag admin : débloque Matériel et Outil (y compris alias outillage).
  if (options.allowMaterielSortie && isMaterielOrOutil(normalized)) {
    return true;
  }
  return false;
}

/** Transfert non-admin : Matériel / Outil uniquement. */
export function articleAllowsTransfer(articleOrType, options = {}) {
  if (options.allowMaterielSortie) return true;
  const normalized = normalizeArticleType(articleOrType);
  if (!normalized) return false;
  return isMaterielOrOutil(normalized);
}

/** Types de mouvement UI autorisés pour un article. */
export function allowedMovementTypesForArticle(articleOrType, options = {}) {
  if (options.allowMaterielSortie) {
    return ['Entrée', 'Transfert', 'Sortie'];
  }
  const normalized = normalizeArticleType(articleOrType);
  if (normalized === ARTICLE_TYPE_CONSOMMABLE) {
    return ['Entrée', 'Sortie'];
  }
  if (isMaterielOrOutil(normalized)) {
    return ['Entrée', 'Transfert'];
  }
  // Type inconnu / autre : entrée uniquement (pas de transfert ni sortie restrictive)
  if (!normalized) {
    return ['Entrée', 'Sortie'];
  }
  return ['Entrée'];
}

export const SORTIE_BLOCKED_MESSAGE =
  'Une sortie standard n’est pas autorisée pour un matériel ou un outil. Utilisez un transfert.';

export const TRANSFERT_BLOCKED_MESSAGE =
  'Un transfert n’est autorisé que pour un matériel ou un outil.';

export const SORTIE_CLEARED_HINT =
  'Le mouvement Sortie n’est pas autorisé pour un matériel ou un outil. Sélectionnez Entrée ou Transfert.';

export const ARTICLE_CLEARED_FOR_SORTIE_HINT =
  'Cet article n’est pas disponible pour une sortie. Sélectionnez un consommable.';

export const ARTICLE_CLEARED_FOR_SORTIE_HINT_WITH_MATERIEL =
  'Cet article n’est pas disponible pour une sortie. Sélectionnez un consommable, un matériel ou un outil.';

export const ARTICLE_CLEARED_FOR_TRANSFERT_HINT =
  'Cet article n’est pas disponible pour un transfert. Sélectionnez un matériel ou un outil.';

/** UI : un article est-il autorisé pour ce type de mouvement ? */
export function articleAllowedForMovementType(articleOrType, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (!type) return false;
  if (options.allowMaterielSortie) return true;
  if (type === 'Entrée') return true;
  if (type === 'Transfert') return articleAllowsTransfer(articleOrType, options);
  if (type === 'Sortie' || type === 'Rebut') {
    return articleAllowsStandardSortie(articleOrType, options);
  }
  return allowedMovementTypesForArticle(articleOrType, options).includes(type);
}

/** UI : filtre la liste d’articles selon le type de mouvement choisi. */
export function filterArticlesForMovementType(articles, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (!type) return [];
  return (articles || []).filter((a) => articleAllowedForMovementType(a, type, options));
}

/**
 * Lève une erreur VALIDATION si mouvement interdit pour le type d’article.
 * @param {{ allowSiteRequestDeliverySortie?: boolean, allowMaterielSortie?: boolean }} [options]
 *   allowSiteRequestDeliverySortie : livraison demande chantier (Matériel + Outil).
 *   allowMaterielSortie : exception admin (tous types / Sortie Matériel+Outil).
 */
export function assertMovementAllowedForArticle(articleOrType, typeMouvement, options = {}) {
  const type = String(typeMouvement || '').trim();
  if (options.allowMaterielSortie) return;
  if (type === 'Transfert') {
    if (!articleAllowsTransfer(articleOrType, options)) {
      const err = new Error(TRANSFERT_BLOCKED_MESSAGE);
      err.code = 'VALIDATION';
      throw err;
    }
    return;
  }
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
