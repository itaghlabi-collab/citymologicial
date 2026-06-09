/**
 * chargeCategories.js — Catégories de charge (Supabase finance_categories)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'finance_categories';
const CHARGES_TABLE = 'finance_charges';

export function normalizeChargeCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom || '',
    description: row.description || '',
    statut: row.statut || 'Active',
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    charges_liees: Number(row.charges_liees) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toChargeCategoryRow(form) {
  return {
    nom: (form.nom || '').trim(),
    description: (form.description || '').trim() || null,
    statut: form.statut || 'Active',
  };
}

async function attachChargeCounts(categories) {
  if (!categories.length) return categories;
  const { data: charges, error } = await getSupabase()
    .from(CHARGES_TABLE)
    .select('id, categorie, category_id');
  if (error) return categories;
  const counts = {};
  (charges || []).forEach((c) => {
    if (c.category_id) counts[c.category_id] = (counts[c.category_id] || 0) + 1;
    else if (c.categorie) {
      const cat = categories.find((x) => x.nom === c.categorie);
      if (cat) counts[cat.id] = (counts[cat.id] || 0) + 1;
    }
  });
  return categories.map((cat) => ({ ...cat, charges_liees: counts[cat.id] || 0 }));
}

export async function listChargeCategories() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });
  if (error) throw error;
  const normalized = (data || []).map(normalizeChargeCategory).filter(Boolean);
  return attachChargeCounts(normalized);
}

export async function createChargeCategory(form) {
  const uid = await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...toChargeCategoryRow(form), created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizeChargeCategory(data);
}

export async function updateChargeCategory(id, form) {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toChargeCategoryRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeChargeCategory(data);
}

export async function deleteChargeCategory(id) {
  await requireSupabaseUserId();
  const { count, error: countErr } = await getSupabase()
    .from(CHARGES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (countErr) throw countErr;
  if (count > 0) throw new Error('Impossible de supprimer : des charges sont liées à cette catégorie.');
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
