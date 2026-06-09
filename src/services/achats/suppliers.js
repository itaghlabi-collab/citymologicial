/**
 * suppliers.js — Fournisseurs achats (Supabase purchase_suppliers)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'purchase_suppliers';

const STATUS_UI_TO_DB = {
  Actif: 'active',
  Inactif: 'inactive',
  Archivé: 'archived',
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
};

const STATUS_DB_TO_UI = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

export function statusToDb(statut) {
  return STATUS_UI_TO_DB[statut] || 'active';
}

export function statusToUi(status) {
  return STATUS_DB_TO_UI[status] || 'Actif';
}

export function normalizeSupplier(row) {
  if (!row) return null;
  const status = row.status || 'active';
  return {
    id: row.id,
    company_name: row.company_name || '',
    ice: row.ice || '',
    rc: row.rc || '',
    tax_id: row.tax_id || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    city: row.city || '',
    main_contact: row.main_contact || '',
    contact_role: row.contact_role || '',
    contact_phone: row.contact_phone || '',
    contact_email: row.contact_email || '',
    supplier_category: row.supplier_category || '',
    payment_terms: row.payment_terms || '',
    preferred_payment_method: row.preferred_payment_method || 'Virement',
    rib: row.rib || '',
    bank: row.bank || '',
    status,
    notes: row.notes || '',
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    commandes_liees: 0,
    // Alias rétrocompatibilité autres sous-modules Achats
    raison_sociale: row.company_name || '',
    contact: row.main_contact || '',
    telephone: row.phone || '',
    if_field: row.tax_id || '',
    adresse: row.address || '',
    ville: row.city || '',
    mode_paiement: row.preferred_payment_method || 'Virement',
    banque: row.bank || '',
    categorie: row.supplier_category || '',
    statut: statusToUi(status),
    favori: false,
  };
}

export function toSupplierRow(form) {
  return {
    company_name: (form.company_name || form.raison_sociale || '').trim(),
    ice: form.ice?.trim() || null,
    rc: form.rc?.trim() || null,
    tax_id: (form.tax_id || form.if_field || '').trim() || null,
    phone: (form.phone || form.telephone || '').trim() || null,
    email: form.email?.trim() || null,
    address: (form.address || form.adresse || '').trim() || null,
    city: (form.city || form.ville || '').trim() || null,
    main_contact: (form.main_contact || form.contact || '').trim() || null,
    contact_role: form.contact_role?.trim() || null,
    contact_phone: form.contact_phone?.trim() || null,
    contact_email: form.contact_email?.trim() || null,
    supplier_category: (form.supplier_category || form.categorie || '').trim() || null,
    payment_terms: form.payment_terms?.trim() || null,
    preferred_payment_method: form.preferred_payment_method || form.mode_paiement || 'Virement',
    rib: form.rib?.trim() || null,
    bank: (form.bank || form.banque || '').trim() || null,
    status: statusToDb(form.status || form.statut || 'active'),
    notes: form.notes?.trim() || null,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listSuppliers({ includeArchived = true } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*')
    .order('company_name', { ascending: true });
  if (!includeArchived) {
    q = q.neq('status', 'archived');
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeSupplier);
}

export async function getSupplierById(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return normalizeSupplier(data);
}

export async function createSupplier(form) {
  const uid = await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...toSupplierRow(form), created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizeSupplier(data);
}

export async function updateSupplier(id, form) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toSupplierRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeSupplier(data);
}

export async function archiveSupplier(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeSupplier(data);
}

export async function deleteSupplier(id) {
  return archiveSupplier(id);
}

export function exportSuppliersCsv(suppliers) {
  const headers = [
    'Société', 'ICE', 'RC', 'IF', 'Téléphone', 'Email', 'Adresse', 'Ville',
    'Contact', 'Fonction', 'Tél. contact', 'Email contact', 'Catégorie',
    'Délai paiement', 'Mode paiement', 'RIB', 'Banque', 'Statut', 'Notes',
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (suppliers || []).map((s) => [
    s.company_name,
    s.ice,
    s.rc,
    s.tax_id,
    s.phone,
    s.email,
    s.address,
    s.city,
    s.main_contact,
    s.contact_role,
    s.contact_phone,
    s.contact_email,
    s.supplier_category,
    s.payment_terms,
    s.preferred_payment_method,
    s.rib,
    s.bank,
    s.statut,
    s.notes,
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
