/**
 * Retenues dédiées sous-traitant (table V3 — soft fail si absente).
 */
import { getSupabase } from '../../lib/supabase';
import { RETENTION_TYPES } from './subcontractorConstants';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';

const TABLE = 'subcontractor_retenues';

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

const STATUS_LABEL = {
  active: 'Active',
  released: 'Libérée',
  cancelled: 'Annulée',
};

export function normalizeRetenue(row) {
  if (!row) return null;
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    projectName: row.projects?.nom || '',
    situationId: row.situation_id || null,
    retentionType: row.retention_type || 'garantie',
    retentionTypeLabel: RETENTION_TYPES.find((t) => t.id === row.retention_type)?.label || row.retention_type,
    amount: Number(row.amount) || 0,
    percentage: row.percentage != null ? Number(row.percentage) : null,
    motif: row.motif || '',
    retentionDate: row.retention_date || '',
    releaseDatePlanned: row.release_date_planned || '',
    releasedAt: row.released_at || null,
    status: row.status || 'active',
    statusLabel: STATUS_LABEL[row.status] || row.status,
    observation: row.observation || '',
    created_at: row.created_at,
  };
}

export async function listRetenues(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, projects ( nom )')
    .eq('subcontractor_id', subcontractorId)
    .is('archived_at', null)
    .order('retention_date', { ascending: false });
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message || '')) return [];
    throw error;
  }
  return (data || []).map(normalizeRetenue);
}

export async function createRetenue(subcontractorId, form = {}) {
  const userId = await getAuthUserId();
  const amount = form.percentage
    ? Math.round(((Number(form.baseAmount) || 0) * (Number(form.percentage) || 0) / 100) * 100) / 100
    : Number(form.amount) || 0;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{
      subcontractor_id: subcontractorId,
      project_id: form.projectId || null,
      situation_id: form.situationId || null,
      retention_type: form.retentionType || 'garantie',
      amount,
      percentage: form.percentage != null && form.percentage !== '' ? Number(form.percentage) : null,
      motif: form.motif?.trim() || null,
      retention_date: form.retentionDate || new Date().toISOString().slice(0, 10),
      release_date_planned: form.releaseDatePlanned || null,
      status: form.status || 'active',
      observation: form.observation?.trim() || null,
      created_by: userId,
    }])
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  const ret = normalizeRetenue(data);
  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'retention',
    projectId: ret.projectId || null,
    situationId: ret.situationId,
    amount: ret.amount,
    observation: ret.motif || ret.retentionTypeLabel,
  }).catch(() => {});
  return ret;
}

export async function releaseRetenue(id, subcontractorId) {
  await getAuthUserId();
  const { data: original, error: getErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (getErr) throw getErr;
  if (!original || original.status !== 'active') {
    const err = new Error('Retenue non libérable.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { error: updErr } = await getSupabase()
    .from(TABLE)
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw updErr;
  // Opération distincte de libération (événement) — ne modifie pas silencieusement le montant
  await logSubcontractorAccountEvent({
    subcontractorId: subcontractorId || original.subcontractor_id,
    eventType: 'retention_released',
    projectId: original.project_id,
    situationId: original.situation_id,
    amount: Number(original.amount) || 0,
    observation: `Libération retenue ${original.motif || original.retention_type || ''}`.trim(),
  }).catch(() => {});
  return listRetenues(subcontractorId || original.subcontractor_id);
}
