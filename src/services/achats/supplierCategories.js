/**
 * supplierCategories.js — Catalogue catégories fournisseurs (annuaire étape 1)
 * Tables : purchase_supplier_categories + purchase_supplier_category_links
 */
import { getSupabase } from '../../lib/supabase';

const CAT_TABLE = 'purchase_supplier_categories';
const LINK_TABLE = 'purchase_supplier_category_links';

/** Mapping anciennes valeurs liste fixe → slug catalogue */
export const LEGACY_CATEGORY_SLUG = {
  Matériaux: 'materiaux-de-construction',
  Équipements: 'equipements-de-chantier',
  Services: 'divers',
  Fournitures: 'fournitures-industrielles',
  Transport: 'transport-logistique',
  'Sous-traitance': 'sous-traitance',
  Informatique: 'informatique',
  Autre: 'divers',
};

export function slugifyCategoryName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'categorie';
}

export function normalizeCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

/** true si la table n’existe pas encore (SQL pas exécuté) */
export function isMissingCategorySchema(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  const code = String(err?.code || '');
  return code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache');
}

export async function listSupplierCategories({ activeOnly = true } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(CAT_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeCategory).filter(Boolean);
}

export async function createSupplierCategory({ name }) {
  const uid = await requireUser();
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nom de catégorie requis.');
  let slug = slugifyCategoryName(trimmed);
  const { data: existing } = await getSupabase()
    .from(CAT_TABLE)
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }
  const { data: maxRow } = await getSupabase()
    .from(CAT_TABLE)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (Number(maxRow?.sort_order) || 0) + 10;
  const { data, error } = await getSupabase()
    .from(CAT_TABLE)
    .insert([{
      name: trimmed,
      slug,
      is_active: true,
      sort_order,
      created_by: uid,
    }])
    .select()
    .single();
  if (error) throw error;
  return normalizeCategory(data);
}

export async function updateSupplierCategory(id, { name, is_active } = {}) {
  await requireUser();
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Nom de catégorie requis.');
    patch.name = trimmed;
  }
  if (is_active !== undefined) patch.is_active = !!is_active;
  const { data, error } = await getSupabase()
    .from(CAT_TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeCategory(data);
}

/** Désactivation douce — jamais de DELETE hard sur une catégorie utilisée */
export async function deactivateSupplierCategory(id) {
  return updateSupplierCategory(id, { is_active: false });
}

export async function listCategoryLinksForSuppliers(supplierIds) {
  const ids = (supplierIds || []).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await getSupabase()
    .from(LINK_TABLE)
    .select('id, supplier_id, category_id, is_primary, purchase_supplier_categories(id, name, slug, is_active)')
    .in('supplier_id', ids);
  if (error) throw error;
  return data || [];
}

/**
 * Remplace les liens catégories d’un fournisseur.
 * @param {string} supplierId
 * @param {{ primaryCategoryId?: string|null, secondaryCategoryIds?: string[] }} opts
 * @returns {Promise<{ primaryName: string|null }>}
 */
export async function setSupplierCategoryLinks(supplierId, { primaryCategoryId = null, secondaryCategoryIds = [] } = {}) {
  await requireUser();
  if (!supplierId) throw new Error('Fournisseur requis.');

  const primary = primaryCategoryId || null;
  const secondary = [...new Set((secondaryCategoryIds || []).filter(Boolean))]
    .filter((id) => id !== primary);

  const { error: delErr } = await getSupabase()
    .from(LINK_TABLE)
    .delete()
    .eq('supplier_id', supplierId);
  if (delErr) throw delErr;

  const rows = [];
  if (primary) {
    rows.push({ supplier_id: supplierId, category_id: primary, is_primary: true });
  }
  secondary.forEach((category_id) => {
    rows.push({ supplier_id: supplierId, category_id, is_primary: false });
  });

  if (rows.length) {
    const { error: insErr } = await getSupabase().from(LINK_TABLE).insert(rows);
    if (insErr) throw insErr;
  }

  let primaryName = null;
  if (primary) {
    const { data } = await getSupabase()
      .from(CAT_TABLE)
      .select('name')
      .eq('id', primary)
      .maybeSingle();
    primaryName = data?.name || null;
  }
  return { primaryName };
}

export function attachCategoriesToSuppliers(suppliers, links) {
  const bySupplier = {};
  (links || []).forEach((link) => {
    const sid = link.supplier_id;
    if (!bySupplier[sid]) bySupplier[sid] = [];
    const cat = link.purchase_supplier_categories;
    bySupplier[sid].push({
      id: link.category_id,
      name: cat?.name || '',
      slug: cat?.slug || '',
      is_active: cat?.is_active !== false,
      is_primary: !!link.is_primary,
    });
  });

  return (suppliers || []).map((s) => {
    const cats = (bySupplier[s.id] || []).slice().sort((a, b) => {
      if (a.is_primary === b.is_primary) return String(a.name).localeCompare(String(b.name), 'fr');
      return a.is_primary ? -1 : 1;
    });
    const primary = cats.find((c) => c.is_primary) || null;
    const secondary = cats.filter((c) => !c.is_primary);
    const primaryName = primary?.name || s.supplier_category || '';
    return {
      ...s,
      supplier_category: primaryName || s.supplier_category || '',
      categorie: primaryName || s.categorie || '',
      primary_category_id: primary?.id || null,
      secondary_category_ids: secondary.map((c) => c.id),
      category_ids: cats.map((c) => c.id),
      categories: cats,
      secondary_categories: secondary,
    };
  });
}
