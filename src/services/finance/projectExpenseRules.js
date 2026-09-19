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

/**
 * Personne (ouvrier / libellé de dépense) parfois rangée comme « projet »
 * via projet_lie / project_name_raw / une fiche projects au même nom.
 * Ce n'est pas un chantier : à exclure uniquement de la liste / du filtre
 * Dépenses par projet. Ne supprime aucune dépense.
 */
const PERSON_LABELS_NOT_PROJECTS = new Set(['AFALAH NABIL']);

function projectNamePart(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const afterRef = raw.includes(' — ') ? raw.split(' — ').slice(1).join(' — ').trim() : raw;
  return afterRef || raw;
}

export function isPersonMisclassifiedAsProjectName(value) {
  const full = normalizeProjectSiteKey(value);
  if (full && PERSON_LABELS_NOT_PROJECTS.has(full)) return true;
  const part = normalizeProjectSiteKey(projectNamePart(value));
  return Boolean(part && PERSON_LABELS_NOT_PROJECTS.has(part));
}

/** Projets chantier affichés dans Dépenses par projet (liste + options). */
export function filterChantierProjectsForDepenses(projects) {
  return (projects || []).filter((p) => !isPersonMisclassifiedAsProjectName(p?.nom));
}

/** Libellé projet pour l'UI : masque uniquement la personne mal classée. */
export function displayChantierProjectName(expense) {
  const nom = String(expense?.project_nom || '').trim();
  if (nom && !isPersonMisclassifiedAsProjectName(nom)) return nom;
  const raw = String(expense?.project_name_raw || '').trim();
  if (raw && !isPersonMisclassifiedAsProjectName(raw)) return raw;
  return '';
}

function isPersonExpenseLine(expense) {
  return isPersonMisclassifiedAsProjectName(expense?.element_depense)
    || isPersonMisclassifiedAsProjectName(expense?.libelle)
    || isPersonMisclassifiedAsProjectName(expense?.fournisseur);
}

function personExpenseFingerprint(expense) {
  const date = String(expense?.date_depense || expense?.date || '').slice(0, 10);
  const montant = String(Math.round((Number(expense?.montant) || 0) * 100));
  const who = normalizeProjectSiteKey(
    expense?.element_depense || expense?.libelle || expense?.fournisseur || '',
  );
  const projet = String(expense?.project_id || expense?.project_nom || expense?.project_name_raw || '').trim();
  return `${date}|${montant}|${who}|${projet}`;
}

function expenseCreatedMs(expense) {
  const raw = expense?.created_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function byCreatedThenId(a, b) {
  const ma = expenseCreatedMs(a);
  const mb = expenseCreatedMs(b);
  if (ma != null && mb != null && ma !== mb) return ma - mb;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

/**
 * Copies accidentelles d'une même dépense personne (ex. AFALAH NABIL 300 MAD)
 * → une seule ligne. N'efface rien en base.
 */
export function collapseDuplicatePersonProjectExpenses(expenses) {
  const rows = Array.isArray(expenses) ? expenses : [];
  const seen = new Set();
  const keep = [];
  const others = [];

  const personRows = [];
  for (const e of rows) {
    if (isPersonExpenseLine(e)) personRows.push(e);
    else others.push(e);
  }

  const sorted = [...personRows].sort(byCreatedThenId);
  for (const e of sorted) {
    const fp = personExpenseFingerprint(e);
    if (seen.has(fp)) continue;
    seen.add(fp);
    keep.push(e);
  }

  return [...others, ...keep].sort((a, b) => (
    String(b?.date_depense || '').localeCompare(String(a?.date_depense || ''))
  ));
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
    // Sync dépenses générales → uniquement Payé.
    // Saisie manuelle « Nouvelle dépense » (sans source ERP) → valide ou payee.
    if (expense.source_type === 'finance_charge' || expense._fromCharge) {
      return expense.statut === 'payee';
    }
    return expense.statut === 'payee' || expense.statut === 'valide';
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

/** Dépense saisie via « Nouvelle dépense » (supprimable) — pas une sync ERP. */
export function isManualProjectExpense(expense) {
  if (!expense || expense.origine !== 'charge_manuelle') return false;
  if (expense._fromCharge) return false;
  if (expense.source_type) return false;
  return true;
}

/** Dépense issue de l’import Excel initial (modifiable / suppressible). */
export function isImportExcelProjectExpense(expense) {
  return String(expense?.origine || '') === 'import_excel';
}

/** Actions manuelles autorisées (Nouvelle dépense OU Import Excel initial). */
export function canEditProjectExpense(expense) {
  return isManualProjectExpense(expense) || isImportExcelProjectExpense(expense);
}

export function canDeleteProjectExpense(expense) {
  return canEditProjectExpense(expense);
}
