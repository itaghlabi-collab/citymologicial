/**
 * Avances globales sous-traitant + imputations analytiques.
 * - Versement avance → 1 sync caisse (source_type subcontractor_advance)
 * - Imputation → aucune écriture financière
 */
import { getSupabase } from '../../lib/supabase';
import { syncFinanceTransaction, FINANCE_SOURCE_TYPES } from '../finance/financeSync';
import { subcontractorFullName } from './subcontractors';
import {
  allocateImputationAcrossAdvances,
  advanceReliquat,
  computeImputationAmount,
  deriveAdvanceStatus,
  round2,
  totalAdvanceReliquat,
  totalAdvancesConsumed,
  totalAdvancesPaid,
} from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';
import { getSituation, patchSituationTotals, deriveAndSetSituationStatus } from './subcontractorSituations';

const ADV_TABLE = 'subcontractor_global_advances';
const IMP_TABLE = 'subcontractor_advance_imputations';

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export const ADVANCE_STATUS_LABEL = {
  unused: 'Non consommée',
  partial: 'Partiellement consommée',
  consumed: 'Totalement consommée',
  cancelled: 'Annulée',
};

export function normalizeAdvance(row) {
  if (!row) return null;
  const amount = Number(row.amount) || 0;
  const consumedAmount = Number(row.consumed_amount) || 0;
  const status = row.status || deriveAdvanceStatus(amount, consumedAmount, !!row.cancelled_at);
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    advanceDate: row.advance_date || '',
    amount,
    consumedAmount,
    reliquat: advanceReliquat({ amount, consumed_amount: consumedAmount }),
    paymentMethod: row.payment_method || '',
    reference: row.reference || '',
    observation: row.observation || '',
    status,
    statusLabel: ADVANCE_STATUS_LABEL[status] || status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelledAt: row.cancelled_at || null,
  };
}

export function normalizeImputation(row) {
  if (!row) return null;
  return {
    id: row.id,
    advanceId: row.advance_id,
    subcontractorId: row.subcontractor_id,
    situationId: row.situation_id || '',
    projectId: row.project_id ? String(row.project_id) : '',
    projectName: row.projects?.nom || '',
    paymentId: row.payment_id || '',
    amount: Number(row.amount) || 0,
    reliquatAfter: Number(row.reliquat_after) || 0,
    imputationDate: row.imputation_date || '',
    observation: row.observation || '',
    created_at: row.created_at,
  };
}

export async function listGlobalAdvances(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(ADV_TABLE)
    .select('*')
    .eq('subcontractor_id', subcontractorId)
    .order('advance_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeAdvance);
}

export async function listAdvanceImputations(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(IMP_TABLE)
    .select('*, projects ( nom )')
    .eq('subcontractor_id', subcontractorId)
    .order('imputation_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeImputation);
}

export function summarizeAdvances(advances = []) {
  return {
    avancesVersees: totalAdvancesPaid(advances),
    avancesConsommees: totalAdvancesConsumed(advances),
    reliquatAvance: totalAdvanceReliquat(advances),
  };
}

/**
 * Enregistre une avance globale + UNE opération caisse idempotente.
 * Clé : (subcontractor_advance, advance.id)
 */
export async function createGlobalAdvance(subcontractorId, form, { subcontractorName } = {}) {
  const userId = await getAuthUserId();
  const amount = round2(Number(form.amount) || 0);
  if (amount <= 0) {
    const err = new Error('Montant d’avance requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const row = {
    subcontractor_id: subcontractorId,
    advance_date: form.advanceDate || new Date().toISOString().slice(0, 10),
    amount,
    consumed_amount: 0,
    payment_method: form.paymentMethod || 'virement',
    reference: form.reference?.trim() || null,
    observation: form.observation?.trim() || null,
    status: 'unused',
    created_by: userId,
  };
  const { data, error } = await getSupabase().from(ADV_TABLE).insert([row]).select('*').single();
  if (error) throw error;
  const advance = normalizeAdvance(data);

  // Sync caisse — une seule écriture (idempotente sur advance.id)
  await syncFinanceTransaction(FINANCE_SOURCE_TYPES.SUBCONTRACTOR_ADVANCE, advance.id, {
    entity: {
      id: advance.id,
      status: 'paid',
      paymentDate: advance.advanceDate,
      amount: advance.amount,
      paymentMethod: advance.paymentMethod,
      reference: advance.reference,
      description: advance.observation || `Avance sous-traitant — ${subcontractorName || ''}`.trim(),
      subcontractorName: subcontractorName || 'Sous-traitant',
      projectId: null,
      projectName: '',
    },
  });

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'advance_paid',
    advanceId: advance.id,
    amount: advance.amount,
    reference: advance.reference,
    observation: advance.observation,
  });

  return advance;
}

/**
 * Met à jour une avance. Métadonnées libres.
 * Changement de montant : amount >= consumed ; sync caisse uniquement si syncCash=true.
 */
export async function updateGlobalAdvance(advanceId, subcontractorId, form = {}, {
  subcontractorName = '',
  syncCash = false,
} = {}) {
  await getAuthUserId();
  const { data: raw, error: readErr } = await getSupabase()
    .from(ADV_TABLE).select('*').eq('id', advanceId).single();
  if (readErr) throw readErr;
  const prev = normalizeAdvance(raw);
  if (prev.status === 'cancelled') {
    const err = new Error('Avance annulée — non modifiable.');
    err.code = 'VALIDATION';
    throw err;
  }

  const nextAmount = form.amount != null && form.amount !== ''
    ? round2(Number(form.amount) || 0)
    : prev.amount;
  if (nextAmount < prev.consumedAmount - 0.009) {
    const err = new Error(
      `Montant (${nextAmount}) inférieur au déjà consommé (${prev.consumedAmount}).`,
    );
    err.code = 'VALIDATION';
    throw err;
  }

  const patch = {
    advance_date: form.advanceDate || prev.advanceDate,
    payment_method: form.paymentMethod ?? prev.paymentMethod,
    reference: form.reference != null ? (form.reference.trim() || null) : prev.reference,
    observation: form.observation != null ? (form.observation.trim() || null) : prev.observation,
    amount: nextAmount,
    status: deriveAdvanceStatus(nextAmount, prev.consumedAmount, false),
  };

  const { data, error } = await getSupabase()
    .from(ADV_TABLE)
    .update(patch)
    .eq('id', advanceId)
    .select('*')
    .single();
  if (error) throw error;
  const updated = normalizeAdvance(data);

  if (syncCash && nextAmount !== prev.amount) {
    await syncFinanceTransaction(FINANCE_SOURCE_TYPES.SUBCONTRACTOR_ADVANCE, advanceId, {
      entity: {
        id: advanceId,
        status: 'paid',
        paymentDate: updated.advanceDate,
        amount: updated.amount,
        paymentMethod: updated.paymentMethod,
        reference: updated.reference,
        description: updated.observation || `Avance sous-traitant — ${subcontractorName}`.trim(),
        subcontractorName: subcontractorName || 'Sous-traitant',
        projectId: null,
        projectName: '',
      },
    });
  }

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'advance_updated',
    advanceId,
    amount: updated.amount,
    reference: updated.reference,
    observation: `Avant: ${prev.amount} → Après: ${updated.amount}`,
    meta: { before: prev.amount, after: updated.amount, syncCash: !!syncCash },
  });

  return updated;
}

/** Recalcule consumed_amount d’une avance = somme de ses imputations. */
export async function resyncAdvanceConsumedFromImputations(advanceId, subcontractorId) {
  await getAuthUserId();
  const { data: imps, error } = await getSupabase()
    .from(IMP_TABLE)
    .select('amount')
    .eq('advance_id', advanceId);
  if (error) throw error;
  const consumed = round2((imps || []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const { data: raw, error: readErr } = await getSupabase()
    .from(ADV_TABLE).select('*').eq('id', advanceId).single();
  if (readErr) throw readErr;
  const amount = Number(raw.amount) || 0;
  if (consumed > amount + 0.009) {
    const err = new Error('Somme des imputations supérieure au montant de l’avance.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error: updErr } = await getSupabase()
    .from(ADV_TABLE)
    .update({
      consumed_amount: consumed,
      status: deriveAdvanceStatus(amount, consumed, !!raw.cancelled_at),
    })
    .eq('id', advanceId)
    .select('*')
    .single();
  if (updErr) throw updErr;
  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'advance_updated',
    advanceId,
    amount: consumed,
    observation: `Resync consommation depuis imputations → ${consumed}`,
  }).catch(() => {});
  return normalizeAdvance(data);
}

/**
 * Corrige le montant d’une imputation (situation non clôturée).
 * Recalcule consumed_amount de l’avance et avances_imputees de la situation.
 * Aucune écriture de caisse.
 */
export async function updateImputationAmount(imputationId, subcontractorId, newAmount) {
  await getAuthUserId();
  const want = round2(Math.max(0, Number(newAmount) || 0));
  const { data: raw, error: readErr } = await getSupabase()
    .from(IMP_TABLE)
    .select('*, projects ( nom )')
    .eq('id', imputationId)
    .single();
  if (readErr) throw readErr;
  const prev = normalizeImputation(raw);
  const oldAmt = prev.amount;

  if (prev.situationId) {
    const sit = await getSituation(prev.situationId);
    if (sit.status === 'closed' || sit.status === 'cancelled') {
      const err = new Error('Situation clôturée — imputation non modifiable.');
      err.code = 'VALIDATION';
      throw err;
    }
    const otherImputed = round2(Math.max(0, (Number(sit.avancesImputees) || 0) - oldAmt));
    const maxOnSit = round2(Math.max(0, (Number(sit.grossAmount) || 0) - (Number(sit.retenues) || 0) - otherImputed));
    if (want > maxOnSit + 0.009) {
      const err = new Error(`Montant max sur la situation : ${maxOnSit} MAD.`);
      err.code = 'VALIDATION';
      throw err;
    }
  }

  const advances = await listGlobalAdvances(subcontractorId);
  const adv = advances.find((a) => a.id === prev.advanceId);
  if (!adv || adv.status === 'cancelled') {
    const err = new Error('Avance introuvable ou annulée.');
    err.code = 'VALIDATION';
    throw err;
  }
  const reliquatWithoutThis = round2(adv.reliquat + oldAmt);
  if (want > reliquatWithoutThis + 0.009) {
    const err = new Error(`Dépasse le reliquat disponible (${reliquatWithoutThis} MAD).`);
    err.code = 'VALIDATION';
    throw err;
  }

  const newConsumed = round2(adv.consumedAmount - oldAmt + want);
  const reliquatAfter = round2(Math.max(0, adv.amount - newConsumed));

  const { error: updImp } = await getSupabase()
    .from(IMP_TABLE)
    .update({ amount: want, reliquat_after: reliquatAfter })
    .eq('id', imputationId);
  if (updImp) throw updImp;

  const { error: updAdv } = await getSupabase()
    .from(ADV_TABLE)
    .update({
      consumed_amount: newConsumed,
      status: deriveAdvanceStatus(adv.amount, newConsumed, false),
    })
    .eq('id', prev.advanceId);
  if (updAdv) throw updAdv;

  if (prev.situationId) {
    const sit = await getSituation(prev.situationId);
    const newSitAv = round2(Math.max(0, (Number(sit.avancesImputees) || 0) - oldAmt + want));
    await patchSituationTotals(prev.situationId, { avancesImputees: newSitAv });
    await deriveAndSetSituationStatus(prev.situationId);
  }

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'advance_imputed',
    projectId: prev.projectId || null,
    situationId: prev.situationId || null,
    advanceId: prev.advanceId,
    amount: want,
    observation: `Correction imputation ${oldAmt} → ${want}`,
    meta: { before: oldAmt, after: want },
  });

  return {
    imputation: { ...prev, amount: want, reliquatAfter },
    reliquatAfter,
    before: oldAmt,
  };
}

/** Annulation avance : uniquement si non consommée — retire la ligne caisse. */
export async function cancelGlobalAdvance(advanceId, subcontractorId, { subcontractorName } = {}) {
  await getAuthUserId();
  const { data: raw, error: readErr } = await getSupabase()
    .from(ADV_TABLE).select('*').eq('id', advanceId).single();
  if (readErr) throw readErr;
  const adv = normalizeAdvance(raw);
  if (adv.consumedAmount > 0.009) {
    const err = new Error('Avance déjà consommée — annulation impossible.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(ADV_TABLE)
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', advanceId)
    .select('*')
    .single();
  if (error) throw error;

  await syncFinanceTransaction(FINANCE_SOURCE_TYPES.SUBCONTRACTOR_ADVANCE, advanceId, {
    entity: {
      id: advanceId,
      status: 'cancelled',
      paymentDate: adv.advanceDate,
      amount: adv.amount,
      paymentMethod: adv.paymentMethod,
      reference: adv.reference,
      subcontractorName: subcontractorName || 'Sous-traitant',
    },
  });

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'advance_cancelled',
    advanceId,
    amount: adv.amount,
    reference: adv.reference,
  });
  return normalizeAdvance(data);
}

/**
 * Impute une avance sur une situation (analytique).
 * Met à jour avances_imputees de la situation — PAS de caisse.
 */
export async function imputeAdvanceOnSituation({
  subcontractorId,
  situationId,
  requestedAmount = null,
  useMax = true,
  paymentId = null,
  observation = '',
}) {
  await getAuthUserId();
  const situation = await getSituation(situationId);
  if (situation.status === 'closed' || situation.status === 'cancelled') {
    const err = new Error('Situation non imputable (clôturée ou annulée).');
    err.code = 'VALIDATION';
    throw err;
  }

  const advances = await listGlobalAdvances(subcontractorId);
  const reliquat = totalAdvanceReliquat(advances);
  const amount = computeImputationAmount({
    gross: situation.grossAmount,
    retenues: situation.retenues,
    alreadyImputed: situation.avancesImputees,
    reliquatDisponible: reliquat,
    requestedAmount,
    useMax,
  });
  if (amount <= 0) {
    return { imputed: 0, imputations: [], situation, reliquatAfter: reliquat };
  }

  const { allocations, unallocated } = allocateImputationAcrossAdvances(advances, amount);
  if (!allocations.length) {
    return { imputed: 0, imputations: [], situation, reliquatAfter: reliquat };
  }

  const created = [];
  for (const alloc of allocations) {
    const { error: updErr } = await getSupabase()
      .from(ADV_TABLE)
      .update({
        consumed_amount: alloc.newConsumed,
        status: alloc.newStatus,
      })
      .eq('id', alloc.advanceId);
    if (updErr) throw updErr;

    const { data: imp, error: impErr } = await getSupabase()
      .from(IMP_TABLE)
      .insert([{
        advance_id: alloc.advanceId,
        subcontractor_id: subcontractorId,
        situation_id: situationId,
        project_id: situation.projectId || null,
        payment_id: paymentId || null,
        amount: alloc.amount,
        reliquat_after: alloc.reliquatAfter,
        imputation_date: new Date().toISOString().slice(0, 10),
        observation: observation || null,
      }])
      .select('*, projects ( nom )')
      .single();
    if (impErr) throw impErr;
    created.push(normalizeImputation(imp));

    await logSubcontractorAccountEvent({
      subcontractorId,
      eventType: 'advance_imputed',
      projectId: situation.projectId || null,
      situationId,
      advanceId: alloc.advanceId,
      paymentId,
      amount: alloc.amount,
      reference: situation.reference,
      observation: `Reliquat après : ${alloc.reliquatAfter}`,
      meta: { reliquatAfter: alloc.reliquatAfter },
    });
  }

  const newAvances = round2(situation.avancesImputees + amount - unallocated);
  let updated = await patchSituationTotals(situationId, {
    avancesImputees: newAvances,
  });
  updated = await deriveAndSetSituationStatus(situationId);

  const advancesAfter = await listGlobalAdvances(subcontractorId);
  return {
    imputed: round2(amount - unallocated),
    imputations: created,
    situation: updated,
    reliquatAfter: totalAdvanceReliquat(advancesAfter),
  };
}

export { computeImputationAmount, totalAdvanceReliquat, subcontractorFullName };
