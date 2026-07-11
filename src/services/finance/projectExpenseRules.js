/**
 * Règles d'alimentation Dépenses par projet :
 * — Dépense générale : uniquement statut « Payé »
 * — Ordre de paiement : uniquement statut « Payé »
 * Pas de synchronisation manuelle : déclenchement à l'enregistrement.
 */
export const CHARGE_SYNC_STATUT = 'Payé';
export const OP_SYNC_STATUT = 'Payé';

export function isChargePaidForProject(charge) {
  return String(charge?.statut || '').trim() === CHARGE_SYNC_STATUT;
}

export function isOpPaidForProject(order) {
  return String(order?.statut || '').trim() === OP_SYNC_STATUT;
}

/** Une ligne project_expenses compte dans les totaux projet. */
export function isCountedProjectExpense(expense) {
  if (!expense || expense.statut === 'annule' || expense.statut === 'en_attente') return false;
  if (expense.origine === 'charge_manuelle') {
    return expense.statut === 'payee';
  }
  if (expense.origine === 'ordre_paiement' || expense.origine === 'achat') {
    return expense.statut === 'payee' || expense.statut === 'valide';
  }
  if (expense.origine === 'import_excel') {
    return expense.statut === 'valide' || expense.statut === 'payee';
  }
  return expense.statut === 'payee' || expense.statut === 'valide';
}
