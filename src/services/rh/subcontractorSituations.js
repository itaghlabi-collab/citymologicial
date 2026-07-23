/**
 * Situations sous-traitant — CRUD + clôture.
 * Les montants nets passent toujours par createPayment / calcSubPaymentTotals.
 */
import { getSupabase } from '../../lib/supabase';
import { situationRemaining, round2 } from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';

const TABLE = 'subcontractor_situations';

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export const SITUATION_STATUS_LABEL = {
  draft: 'Brouillon',
  in_progress: 'En cours',
  partially_paid: 'Partiellement réglée',
  settled: 'Soldée',
  closed: 'Clôturée',
  cancelled: 'Annulée',
};

export const SITUATION_UNITS = [
  'm²', 'ml', 'm³', 'kg', 'tonne', 'point', 'unité',
  'tâche', 'service', 'forfait', 'jour', 'heure', 'autre',
];

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

export function normalizeSituation(row) {
  if (!row) return null;
  const grossAmount = Number(row.gross_amount) || 0;
  const avancesImputees = Number(row.avances_imputees) || 0;
  const retenues = Number(row.retenues) || 0;
  const amountPaid = Number(row.amount_paid) || 0;
  const remaining = situationRemaining({
    grossAmount, avancesImputees, retenues, amountPaid,
  });
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    projectName: row.projects?.nom || row.project_name || '',
    assignmentId: row.assignment_id || null,
    reference: row.reference || '',
    designation: row.designation || '',
    paymentType: row.payment_type || '',
    quantity: Number(row.quantity) || 0,
    unit: row.unit || '',
    unitPrice: Number(row.unit_price) || 0,
    grossAmount,
    avancesImputees,
    retenues,
    amountPaid,
    remaining,
    status: row.status || 'in_progress',
    statusLabel: SITUATION_STATUS_LABEL[row.status] || row.status || '—',
    situationDate: row.situation_date || '',
    closedAt: row.closed_at || null,
    notes: row.notes || '',
    isHistorical: !!row.is_historical,
    groupId: row.group_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSituationRow(form, subcontractorId) {
  const row = {
    subcontractor_id: subcontractorId,
    project_id: emptyToNull(form.projectId) || null,
    assignment_id: emptyToNull(form.assignmentId) || null,
    reference: emptyToNull(form.reference?.trim()),
    designation: emptyToNull(form.designation?.trim()),
    payment_type: emptyToNull(form.paymentType) || 'metre',
    quantity: Number(form.quantity) || 0,
    unit: emptyToNull(form.unit),
    unit_price: Number(form.unitPrice) || 0,
    gross_amount: round2(Number(form.grossAmount) || 0),
    avances_imputees: round2(Number(form.avancesImputees) || 0),
    retenues: round2(Number(form.retenues) || 0),
    amount_paid: round2(Number(form.amountPaid) || 0),
    status: form.status || 'in_progress',
    situation_date: form.situationDate || new Date().toISOString().slice(0, 10),
    notes: emptyToNull(form.notes?.trim()),
    is_historical: !!form.isHistorical,
  };
  if (form.groupId) row.group_id = form.groupId;
  return row;
}

export async function listSituations(subcontractorId) {
  await getAuthUserId();
  let q = getSupabase()
    .from(TABLE)
    .select('*, projects ( nom )')
    .order('situation_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (subcontractorId) q = q.eq('subcontractor_id', subcontractorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeSituation);
}

export async function getSituation(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, projects ( nom )')
    .eq('id', id)
    .single();
  if (error) throw error;
  return normalizeSituation(data);
}

export async function createSituation(subcontractorId, form) {
  const userId = await getAuthUserId();
  const row = {
    ...toSituationRow(form, subcontractorId),
    created_by: userId,
  };
  if (!row.gross_amount || row.gross_amount <= 0) {
    const err = new Error('Montant brut requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  let { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*, projects ( nom )')
    .single();
  // Colonne group_id absente → retry sans (exécuter RUN_SUBCONTRACTOR_SITUATION_GROUP.sql)
  if (error && row.group_id && /group_id/i.test(error.message || '')) {
    const { group_id: _g, ...rest } = row;
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .insert([rest])
      .select('*, projects ( nom )')
      .single());
  }
  if (error) throw error;
  const sit = normalizeSituation(data);
  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'situation_created',
    projectId: sit.projectId || null,
    situationId: sit.id,
    amount: sit.grossAmount,
    reference: sit.reference,
    observation: sit.designation,
  });
  return sit;
}

export async function updateSituation(id, subcontractorId, form) {
  await getAuthUserId();
  const existing = await getSituation(id);
  if (existing.status === 'closed') {
    const err = new Error('Situation clôturée — non modifiable.');
    err.code = 'VALIDATION';
    throw err;
  }
  const row = toSituationRow({ ...form, status: form.status || existing.status }, subcontractorId);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  const sit = normalizeSituation(data);
  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'situation_updated',
    projectId: sit.projectId || null,
    situationId: sit.id,
    amount: sit.grossAmount,
    reference: sit.reference,
  });
  return sit;
}

/** Met à jour les totaux d’une situation après paiement / imputation (sans changer la formule net). */
export async function patchSituationTotals(id, patch = {}) {
  await getAuthUserId();
  const updates = {};
  if (patch.avancesImputees != null) updates.avances_imputees = round2(patch.avancesImputees);
  if (patch.retenues != null) updates.retenues = round2(patch.retenues);
  if (patch.amountPaid != null) updates.amount_paid = round2(patch.amountPaid);
  if (patch.status) updates.status = patch.status;
  if (patch.grossAmount != null) updates.gross_amount = round2(patch.grossAmount);
  if (!Object.keys(updates).length) return getSituation(id);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  return normalizeSituation(data);
}

export async function deriveAndSetSituationStatus(id) {
  const sit = await getSituation(id);
  if (sit.status === 'closed' || sit.status === 'cancelled') return sit;
  const rem = sit.remaining;
  let status = 'in_progress';
  if (sit.amountPaid > 0.009 && rem > 0.009) status = 'partially_paid';
  if (rem <= 0.009 && (sit.amountPaid > 0.009 || sit.avancesImputees > 0.009)) status = 'settled';
  if (sit.amountPaid <= 0.009 && sit.avancesImputees <= 0.009 && rem > 0.009) status = 'in_progress';
  if (status === sit.status) return sit;
  return patchSituationTotals(id, { status });
}

/** Clôture uniquement si soldée (reste ≈ 0). */
export async function closeSituation(id, subcontractorId) {
  const userId = await getAuthUserId();
  const sit = await getSituation(id);
  if (sit.status === 'closed') return sit;
  if (sit.status === 'cancelled') {
    const err = new Error('Situation annulée — clôture impossible.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (sit.remaining > 0.009) {
    const err = new Error('La situation doit être soldée avant clôture.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId,
    })
    .eq('id', id)
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  const closed = normalizeSituation(data);
  await logSubcontractorAccountEvent({
    subcontractorId: subcontractorId || closed.subcontractorId,
    eventType: 'situation_closed',
    projectId: closed.projectId || null,
    situationId: closed.id,
    amount: 0,
    reference: closed.reference,
  });
  return closed;
}

export async function cancelSituation(id, subcontractorId) {
  await getAuthUserId();
  const sit = await getSituation(id);
  if (sit.status === 'closed') {
    const err = new Error('Situation clôturée — annulation impossible.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  const cancelled = normalizeSituation(data);
  await logSubcontractorAccountEvent({
    subcontractorId: subcontractorId || cancelled.subcontractorId,
    eventType: 'situation_cancelled',
    projectId: cancelled.projectId || null,
    situationId: cancelled.id,
    reference: cancelled.reference,
  });
  return cancelled;
}
