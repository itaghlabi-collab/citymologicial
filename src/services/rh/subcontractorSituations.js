/**
 * Situations sous-traitant — CRUD + clôture.
 * Les montants nets passent toujours par createPayment / calcSubPaymentTotals.
 */
import { getSupabase } from '../../lib/supabase';
import { situationRemaining, round2 } from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';
import {
  buildHistoricalInsertFields,
  normalizeHistoricalFlags,
  isMissingHistoricalColumnError,
  stripHistoricalColumns,
} from './subcontractorHistorical';

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
  draft: 'En cours',
  in_progress: 'En cours',
  partially_paid: 'En cours',
  settled: 'En cours',
  closed: 'Clôturée',
  cancelled: 'Annulée',
};

/** Libellé simple demandé UI : En cours / Clôturée / Annulée */
export function situationStatusSimple(status) {
  if (status === 'cancelled') return 'Annulée';
  if (status === 'closed') return 'Clôturée';
  return 'En cours';
}

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
    statusLabel: situationStatusSimple(row.status) || row.status || '—',
    situationDate: row.situation_date || '',
    closedAt: row.closed_at || null,
    notes: row.notes || '',
    isHistorical: !!row.is_historical || !!row.already_accounted,
    groupId: row.group_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...normalizeHistoricalFlags(row),
  };
}

function toSituationRow(form, subcontractorId, { userId = null } = {}) {
  const hist = buildHistoricalInsertFields({
    ...form,
    alreadyAccounted: form.alreadyAccounted ?? form.isHistorical,
  }, userId);
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
    is_historical: !!form.isHistorical || !!hist.already_accounted,
    ...hist,
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
    ...toSituationRow(form, subcontractorId, { userId }),
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
  if (error && isMissingHistoricalColumnError(error)) {
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .insert([stripHistoricalColumns(row)])
      .select('*, projects ( nom )')
      .single());
  }
  if (error) throw error;
  const sit = normalizeSituation(data);
  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: sit.alreadyAccounted ? 'historical' : 'situation_created',
    projectId: sit.projectId || null,
    situationId: sit.id,
    amount: sit.grossAmount,
    reference: sit.reference,
    observation: sit.alreadyAccounted
      ? `Travaux historiques déjà comptabilisés — ${sit.designation || ''}`.trim()
      : sit.designation,
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

/** Clôture d’une période de travaux (ne clôture pas le projet).
 * Autorisée même si un reste existe — la suite passe sur une nouvelle situation.
 */
export async function closeSituation(id, subcontractorId) {
  const userId = await getAuthUserId();
  const sit = await getSituation(id);
  if (sit.status === 'closed') return sit;
  if (sit.status === 'cancelled') {
    const err = new Error('Situation annulée — clôture impossible.');
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
    observation: sit.remaining > 0.009
      ? `Clôturée avec reste ${sit.remaining} MAD — suite sur nouvelle situation`
      : null,
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
  if (sit.status === 'cancelled') return sit;

  await releaseSituationAdvanceImputations(id, sit);

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
    observation: 'Ligne de travaux annulée — montants recalculés',
  });
  return cancelled;
}

/** Remet à 0 puis supprime les imputations d’avance liées à une situation. */
async function releaseSituationAdvanceImputations(situationId, sit) {
  const { data: imps } = await getSupabase()
    .from('subcontractor_advance_imputations')
    .select('id, advance_id, amount')
    .eq('situation_id', situationId);
  const advanceIds = [...new Set((imps || []).map((i) => i.advance_id).filter(Boolean))];

  for (const imp of imps || []) {
    await getSupabase()
      .from('subcontractor_advance_imputations')
      .delete()
      .eq('id', imp.id);
  }
  if (sit && ((Number(sit.avancesImputees) || 0) > 0.009 || (imps || []).length)) {
    await getSupabase()
      .from(TABLE)
      .update({ avances_imputees: 0 })
      .eq('id', situationId);
  }
  for (const advanceId of advanceIds) {
    const { data: remImps } = await getSupabase()
      .from('subcontractor_advance_imputations')
      .select('amount')
      .eq('advance_id', advanceId);
    const consumed = round2((remImps || []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
    const { data: adv } = await getSupabase()
      .from('subcontractor_global_advances')
      .select('amount, cancelled_at')
      .eq('id', advanceId)
      .maybeSingle();
    if (adv) {
      const amount = Number(adv.amount) || 0;
      let status = 'unused';
      if (adv.cancelled_at) status = 'cancelled';
      else if (consumed <= 0.009) status = 'unused';
      else if (consumed + 0.009 >= amount) status = 'consumed';
      else status = 'partial';
      await getSupabase()
        .from('subcontractor_global_advances')
        .update({ consumed_amount: consumed, status })
        .eq('id', advanceId);
    }
  }
  return advanceIds;
}

/**
 * Suppression définitive d’une situation (ligne de travaux) :
 * libère l’avance, supprime les paiements liés, efface la ligne.
 */
export async function purgeSituation(id, subcontractorId) {
  await getAuthUserId();
  const sit = await getSituation(id);
  const subId = subcontractorId || sit.subcontractorId;

  await releaseSituationAdvanceImputations(id, sit);

  // Paiements liés à la situation (colonne optionnelle)
  try {
    const { data: bySit } = await getSupabase()
      .from('subcontractor_payments')
      .select('id')
      .eq('situation_id', id);
    const { deleteSubcontractorPayment } = await import('./subcontractors');
    for (const p of bySit || []) {
      await deleteSubcontractorPayment(p.id);
    }
  } catch {
    /* situation_id absent ou RLS — poursuite */
  }

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;

  await logSubcontractorAccountEvent({
    subcontractorId: subId,
    eventType: 'situation_deleted',
    projectId: sit.projectId || null,
    situationId: id,
    reference: sit.reference,
    observation: 'Situation / ligne de travaux supprimée définitivement',
  }).catch(() => {});

  return { id, projectId: sit.projectId };
}

/**
 * Suppression définitive d’un projet travaillé pour un sous-traitant :
 * toutes les situations, paiements projet, affectation — rien n’est conservé.
 * L’avance globale versée reste ; seule la consommation est recalculée.
 */
export async function purgeSubcontractorProject(subcontractorId, {
  projectId = null,
  assignmentId = null,
  projectName = '',
} = {}) {
  await getAuthUserId();
  if (!subcontractorId) {
    const err = new Error('Sous-traitant requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!projectId && !assignmentId) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const allSits = await listSituations(subcontractorId);
  const sits = allSits.filter((s) => {
    if (projectId && String(s.projectId) === String(projectId)) return true;
    if (assignmentId && String(s.assignmentId) === String(assignmentId)) return true;
    return false;
  });

  for (const s of sits) {
    await purgeSituation(s.id, subcontractorId);
  }

  const { deleteSubcontractorPayment } = await import('./subcontractors');
  if (projectId) {
    const { data: pays } = await getSupabase()
      .from('subcontractor_payments')
      .select('id')
      .eq('subcontractor_id', subcontractorId)
      .eq('project_id', projectId);
    for (const p of pays || []) {
      await deleteSubcontractorPayment(p.id);
    }

    const { error: assignErr } = await getSupabase()
      .from('subcontractor_project_assignments')
      .delete()
      .eq('subcontractor_id', subcontractorId)
      .eq('project_id', projectId);
    if (assignErr) throw assignErr;
  } else if (assignmentId) {
    const { error: assignErr } = await getSupabase()
      .from('subcontractor_project_assignments')
      .delete()
      .eq('id', assignmentId);
    if (assignErr) throw assignErr;
  }

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'project_purged',
    projectId: projectId || null,
    observation: `Projet « ${projectName || projectId || assignmentId} » supprimé définitivement — calculs recalculés`,
  }).catch(() => {});

  return {
    deletedSituations: sits.length,
    projectId,
  };
}
