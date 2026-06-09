/**
 * charges.js — Charges / dépenses (Supabase)
 */
import { getSupabase } from '../../lib/supabase';
import { syncChargeToTransaction } from './financeTransactions';

const TABLE = 'finance_charges';

export function normalizeCharge(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date_charge || '',
    libelle: row.libelle || '',
    categorie: row.categorie || '',
    category_id: row.category_id || null,
    montant: Number(row.montant) || 0,
    fournisseur: row.fournisseur || '',
    projet_lie: row.projet_lie || '',
    project_id: row.project_id || null,
    vehicle_id: row.vehicle_id || null,
    worker_id: row.worker_id || null,
    client_id: row.client_id || null,
    supplier_id: row.supplier_id || null,
    departement: row.departement || '',
    mode_paiement: row.mode_paiement || 'Virement',
    ref_paiement: row.ref_paiement || '',
    statut: row.statut || 'Brouillon',
    commentaire: row.commentaire || '',
    validateur: row.validateur || '',
    ref: row.ref_charge || '',
    justificatifs: row.justificatifs || [],
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
  };
}

export function toChargeRow(form, categoryName) {
  return {
    date_charge: form.date || null,
    libelle: (form.libelle || '').trim(),
    categorie: categoryName || form.categorie || null,
    category_id: form.category_id || null,
    montant: Number(form.montant) || 0,
    fournisseur: form.fournisseur || null,
    projet_lie: form.projet_lie || null,
    project_id: form.project_id || null,
    vehicle_id: form.vehicle_id || null,
    worker_id: form.worker_id || null,
    client_id: form.client_id || null,
    supplier_id: form.supplier_id || null,
    departement: form.departement || null,
    mode_paiement: form.mode_paiement || 'Virement',
    ref_paiement: form.ref_paiement || null,
    statut: form.statut || 'Brouillon',
    commentaire: form.commentaire || null,
    validateur: form.validateur || null,
    ref_charge: form.ref || null,
    justificatifs: form.justificatifs || [],
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listFinanceCharges() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_charge', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeCharge);
}

export async function createFinanceCharge(form, categoryName) {
  const uid = await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...toChargeRow(form, categoryName), created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  const charge = normalizeCharge(data);
  await syncChargeToTransaction(charge);
  return charge;
}

export async function updateFinanceCharge(id, form, categoryName) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toChargeRow(form, categoryName))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const charge = normalizeCharge(data);
  await syncChargeToTransaction(charge);
  return charge;
}

export async function deleteFinanceCharge(id) {
  await requireUser();
  await getSupabase().from('finance_transactions').delete().eq('charge_id', id);
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
