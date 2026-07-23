/**
 * Math pures avances / imputations — réutilise calcSubPaymentTotals (aucune formule parallèle).
 */
import { calcSubPaymentTotals } from '../../utils/rh/subcontractorPaymentFormUtils';

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Reliquat d’une avance = max(0, amount − consumed). */
export function advanceReliquat(advance) {
  const amount = round2(Number(advance?.amount) || 0);
  const consumed = round2(Number(advance?.consumed_amount ?? advance?.consumedAmount) || 0);
  return round2(Math.max(0, amount - consumed));
}

/** Reliquat global d’une liste d’avances (hors annulées). */
export function totalAdvanceReliquat(advances = []) {
  return round2(
    (advances || [])
      .filter((a) => (a.status || 'unused') !== 'cancelled')
      .reduce((s, a) => s + advanceReliquat(a), 0),
  );
}

export function totalAdvancesPaid(advances = []) {
  return round2(
    (advances || [])
      .filter((a) => (a.status || 'unused') !== 'cancelled')
      .reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
}

export function totalAdvancesConsumed(advances = []) {
  return round2(
    (advances || [])
      .filter((a) => (a.status || 'unused') !== 'cancelled')
      .reduce((s, a) => s + (Number(a.consumed_amount ?? a.consumedAmount) || 0), 0),
  );
}

/**
 * Calcule le montant d’imputation autorisé.
 * - ne dépasse pas le brut restant après retenues déjà prévues
 * - ne dépasse pas le reliquat
 * - jamais négatif
 */
export function computeImputationAmount({
  gross,
  retenues = 0,
  alreadyImputed = 0,
  reliquatDisponible,
  requestedAmount = null,
  useMax = true,
}) {
  const g = round2(Number(gross) || 0);
  const r = round2(Math.max(0, Number(retenues) || 0));
  const already = round2(Math.max(0, Number(alreadyImputed) || 0));
  const reliquat = round2(Math.max(0, Number(reliquatDisponible) || 0));
  const maxOnSituation = round2(Math.max(0, g - r - already));
  const maxAllowed = round2(Math.min(maxOnSituation, reliquat));
  if (maxAllowed <= 0) return 0;
  if (useMax || requestedAmount == null || requestedAmount === '') return maxAllowed;
  const req = round2(Math.max(0, Number(requestedAmount) || 0));
  return round2(Math.min(req, maxAllowed));
}

/** Statut avance après consommation. */
export function deriveAdvanceStatus(amount, consumed, cancelled = false) {
  if (cancelled) return 'cancelled';
  const a = round2(amount);
  const c = round2(consumed);
  if (c <= 0.009) return 'unused';
  if (c + 0.009 >= a) return 'consumed';
  return 'partial';
}

/**
 * Résultat d’une situation / paiement — délègue à calcSubPaymentTotals.
 * paymentType: metre | tache | service
 */
export function computeSituationPaymentResult({
  paymentType,
  quantity,
  unitPrice,
  amount,
  avances,
  retenues,
}) {
  return calcSubPaymentTotals(paymentType || 'metre', {
    quantity,
    unitPrice,
    amount: amount ?? (Number(quantity) || 0) * (Number(unitPrice) || 0),
    avances,
    retenues,
  });
}

/** Solde situation = max(0, brut − avance imputée − retenues − payé). */
export function situationRemaining({
  grossAmount,
  avancesImputees,
  retenues,
  amountPaid,
}) {
  return round2(Math.max(
    0,
    (Number(grossAmount) || 0)
      - (Number(avancesImputees) || 0)
      - (Number(retenues) || 0)
      - (Number(amountPaid) || 0),
  ));
}

/**
 * Répartit une imputation sur plusieurs avances (FIFO par date).
 * Retourne [{ advanceId, amount, reliquatAfter }] sans muter les objets.
 */
export function allocateImputationAcrossAdvances(advances, amountToImpute) {
  let remaining = round2(Math.max(0, Number(amountToImpute) || 0));
  const sorted = [...(advances || [])]
    .filter((a) => (a.status || 'unused') !== 'cancelled' && advanceReliquat(a) > 0)
    .sort((a, b) => String(a.advanceDate || a.advance_date || '').localeCompare(String(b.advanceDate || b.advance_date || '')));

  const allocations = [];
  for (const adv of sorted) {
    if (remaining <= 0) break;
    const rel = advanceReliquat(adv);
    const take = round2(Math.min(rel, remaining));
    if (take <= 0) continue;
    const newConsumed = round2((Number(adv.consumed_amount ?? adv.consumedAmount) || 0) + take);
    allocations.push({
      advanceId: adv.id,
      amount: take,
      reliquatAfter: round2(Math.max(0, (Number(adv.amount) || 0) - newConsumed)),
      newConsumed,
      newStatus: deriveAdvanceStatus(adv.amount, newConsumed, false),
    });
    remaining = round2(remaining - take);
  }
  return { allocations, unallocated: remaining };
}
