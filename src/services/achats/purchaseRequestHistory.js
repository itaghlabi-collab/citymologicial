/**
 * purchaseRequestHistory.js — Historique traçabilité demandes d'achat
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'purchase_request_history';

export function normalizeHistoryRow(row) {
  if (!row) return null;
  const at = row.created_at ? new Date(row.created_at) : null;
  return {
    id: row.id,
    purchase_request_id: row.purchase_request_id,
    action: row.action || '',
    detail: row.detail || '',
    commentaire: row.commentaire || '',
    user_id: row.user_id,
    user_name: row.user_name || 'Système',
    created_at: row.created_at,
    date_label: at ? at.toLocaleDateString('fr-FR') : '—',
    time_label: at ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
  };
}

export async function listPurchaseRequestHistory(purchaseRequestId) {
  if (!purchaseRequestId) return [];
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('purchase_request_id', purchaseRequestId)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map(normalizeHistoryRow);
}

export async function appendPurchaseRequestHistory({
  purchaseRequestId,
  action,
  detail = '',
  commentaire = '',
  userId = null,
  userName = 'Système',
}) {
  if (!purchaseRequestId || !action) return null;
  const row = {
    purchase_request_id: purchaseRequestId,
    action,
    detail,
    user_id: userId,
    user_name: userName,
  };
  try {
    row.commentaire = commentaire || null;
  } catch { /* colonne optionnelle */ }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) {
    if (error.code === '42P01') return null;
    if (error.message?.includes('commentaire')) {
      const { detail: _d, ...without } = row;
      const { data: d2, error: e2 } = await getSupabase().from(TABLE).insert([without]).select().single();
      if (e2) throw e2;
      return normalizeHistoryRow(d2);
    }
    throw error;
  }
  return normalizeHistoryRow(data);
}
