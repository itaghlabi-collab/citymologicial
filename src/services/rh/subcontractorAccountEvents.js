/**
 * Journal d’événements du compte sous-traitant.
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'subcontractor_account_events';

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export const ACCOUNT_EVENT_LABELS = {
  situation_created: 'Création situation',
  situation_updated: 'Modification situation',
  situation_closed: 'Clôture',
  situation_cancelled: 'Annulation situation',
  situation_reopened: 'Réouverture',
  advance_paid: 'Avance versée',
  advance_cancelled: 'Avance annulée',
  advance_imputed: 'Imputation d’avance',
  retention: 'Retenue',
  payment: 'Paiement',
  payment_updated: 'Modification paiement',
  historical: 'Donnée historique',
};

export async function logSubcontractorAccountEvent({
  subcontractorId,
  eventType,
  projectId = null,
  situationId = null,
  advanceId = null,
  paymentId = null,
  amount = 0,
  reference = '',
  observation = '',
  meta = {},
  userLabel = '',
}) {
  if (!subcontractorId || !eventType) return null;
  let userId = null;
  try { userId = await getAuthUserId(); } catch { /* ignore */ }
  const row = {
    subcontractor_id: subcontractorId,
    event_type: eventType,
    event_date: new Date().toISOString(),
    project_id: projectId || null,
    situation_id: situationId || null,
    advance_id: advanceId || null,
    payment_id: paymentId || null,
    amount: Number(amount) || 0,
    reference: reference || null,
    observation: observation || null,
    user_id: userId,
    user_label: userLabel || null,
    meta,
  };
  const { data, error } = await getSupabase().from(TABLE).insert([row]).select('*').single();
  if (error) {
    console.warn('[subcontractor events]', error.message);
    return null;
  }
  return data;
}

export async function listAccountEvents(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, projects ( nom )')
    .eq('subcontractor_id', subcontractorId)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    date: row.event_date,
    type: row.event_type,
    typeLabel: ACCOUNT_EVENT_LABELS[row.event_type] || row.event_type,
    projectId: row.project_id ? String(row.project_id) : '',
    projectLabel: row.projects?.nom || '',
    situationId: row.situation_id || '',
    advanceId: row.advance_id || '',
    paymentId: row.payment_id || '',
    amount: Number(row.amount) || 0,
    reference: row.reference || '',
    observation: row.observation || '',
    userLabel: row.user_label || '',
    meta: row.meta || {},
  }));
}
