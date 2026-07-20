/**
 * Règles d'alimentation Dépenses par projet :
 * — Dépense générale : uniquement statut « Payé »
 * — Ordre de paiement : uniquement statut « Payé »
 * — Paiement ouvrier (Main d'œuvre) : uniquement si Payé + chantier client
 * Pas de synchronisation manuelle : déclenchement à l'enregistrement.
 */
export const CHARGE_SYNC_STATUT = 'Payé';
export const OP_SYNC_STATUT = 'Payé';
export const CHARGE_BACKFILL_STATUTS = ['Payé', 'Validé', 'Validée', 'Comptabilisée', 'Comptabilisé'];
export const WORKER_PAYMENT_SOURCE_TYPES = new Set(['worker_weekly_payment', 'worker_payment']);

export function isChargePaidForProject(charge) {
  return String(charge?.statut || '').trim() === CHARGE_SYNC_STATUT;
}

export function isChargeEligibleForBackfill(charge) {
  if (!charge) return false;
  const statut = String(charge.statut || '').trim();
  if (['Annulé', 'Refusé', 'Refusée', 'Brouillon'].includes(statut)) return false;
  return CHARGE_BACKFILL_STATUTS.includes(statut);
}

export function isOpPaidForProject(order) {
  return String(order?.statut || '').trim() === OP_SYNC_STATUT;
}

/** Normalise un nom de projet / site pour comparaison (ATELIER, DÉPÔT…). */
export function normalizeProjectSiteKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Centres de coûts internes : ATELIER / DÉPÔT.
 * → dépense générale (hors projet), jamais project_expenses / KPI chantier.
 */
export function isInternalCostCenterName(name) {
  return Boolean(resolveInternalCostCenterLabel(name));
}

/** Libellé centre interne normalisé : ATELIER | DÉPÔT | null. */
export function resolveInternalCostCenterLabel(name) {
  const key = normalizeProjectSiteKey(name);
  if (!key) return null;
  if (key === 'ATELIER' || key.startsWith('ATELIER ')) return 'ATELIER';
  if (key === 'DEPOT' || key.startsWith('DEPOT ')) return 'DÉPÔT';
  return null;
}

/** Catégorie Dépenses générales pour paie ATELIER / DÉPÔT. */
export const INTERNAL_LABOR_CHARGE_CATEGORY = "Main-d'œuvre interne";

/** Préfixe ref_paiement idempotent (lien unique paiement ouvrier → dépense générale). */
export function workerPaymentChargeRefKey(sourceId) {
  return sourceId ? `citymo:wp:${sourceId}` : '';
}

export function isWorkerPaymentSourceType(sourceType) {
  return WORKER_PAYMENT_SOURCE_TYPES.has(String(sourceType || ''));
}

/** Une ligne project_expenses compte dans les totaux projet. */
export function isCountedProjectExpense(expense) {
  if (!expense || expense.statut === 'annule' || expense.statut === 'en_attente') return false;
  if (expense.origine === 'charge_manuelle') {
    return expense.statut === 'payee';
  }
  if (expense.origine === 'main_oeuvre') {
    return expense.statut === 'payee' || expense.statut === 'valide';
  }
  if (expense.origine === 'ordre_paiement' || expense.origine === 'achat') {
    return expense.statut === 'payee' || expense.statut === 'valide';
  }
  if (expense.origine === 'import_excel') {
    return expense.statut === 'valide' || expense.statut === 'payee';
  }
  return expense.statut === 'payee' || expense.statut === 'valide';
}
