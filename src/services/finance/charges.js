/**
 * charges.js — Charges / dépenses (Supabase)
 */
import { getSupabase } from '../../lib/supabase';
import { syncChargeToTransaction } from './financeTransactions';
import { syncFinanceTransaction, FINANCE_SOURCE_TYPES } from './financeSync';

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

export async function generateChargeRef() {
  const year = new Date().getFullYear();
  const prefix = `CHG-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref_charge')
    .like('ref_charge', `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  for (const row of data || []) {
    const match = String(row.ref_charge || '').match(/-(\d{3,})$/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function assignChargeRefIfMissing(id, existingRef = '') {
  const current = String(existingRef || '').trim();
  if (current) return current;
  const newRef = await generateChargeRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ ref_charge: newRef })
    .eq('id', id)
    .select('ref_charge')
    .single();
  if (error) throw error;
  return data.ref_charge;
}

/** Attribue une référence CHG aux dépenses existantes sans ref_charge. */
export async function reconcileMissingChargeRefs() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, ref_charge, created_at')
    .or('ref_charge.is.null,ref_charge.eq.')
    .order('created_at', { ascending: true });
  if (error || !data?.length) return 0;
  let fixed = 0;
  for (const row of data) {
    await assignChargeRefIfMissing(row.id, row.ref_charge);
    fixed += 1;
  }
  return fixed;
}

export function chargeDisplayRef(charge) {
  return String(charge?.ref || charge?.ref_charge || '').trim();
}

export async function listFinanceCharges() {
  await requireUser();
  await reconcileMissingChargeRefs();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_charge', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeCharge);
}

export async function createFinanceCharge(form, categoryName) {
  const uid = await requireUser();
  const row = { ...toChargeRow(form, categoryName), created_by: uid };
  if (!String(row.ref_charge || '').trim()) {
    row.ref_charge = await generateChargeRef();
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) throw error;
  const charge = normalizeCharge(data);
  await syncChargeToTransaction(charge);
  return charge;
}

export async function updateFinanceCharge(id, form, categoryName) {
  await requireUser();
  const row = toChargeRow(form, categoryName);
  if (!String(row.ref_charge || '').trim()) {
    row.ref_charge = await assignChargeRefIfMissing(id, form.ref);
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
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
  await syncFinanceTransaction(FINANCE_SOURCE_TYPES.CHARGE, id, {
    entity: { statut: 'Annulé', montant: 0 },
    active: false,
  }).catch(() => {});
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
