/**
 * categories.js — CRM Catégories CRUD (Supabase public.categories)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'categories';

const COULEURS = [
  '#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2',
  '#0288D1', '#455A64', '#E65100', '#00796B', '#C2185B',
];

function slugify(nom) {
  return (nom || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'categorie';
}

function colorFromSlug(slug) {
  let h = 0;
  const s = slug || '';
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return COULEURS[Math.abs(h) % COULEURS.length];
}

/** DB row → shape Categories.jsx */
export function normalizeCategorie(row, parentNom = '') {
  if (!row) return null;
  const slug = row.slug || slugify(row.nom);
  return {
    id: row.id,
    nom: row.nom || '',
    parent_id: row.parent_id || '',
    slug,
    couleur: colorFromSlug(slug),
    statut: 'actif',
    description: parentNom ? `Sous-categorie de ${parentNom}` : (row.parent_id ? 'Sous-categorie' : 'Categorie racine'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row */
export function toCategorieRow(form) {
  const nom = form.nom?.trim() || '';
  return {
    nom,
    slug: form.slug?.trim() || slugify(nom),
    parent_id: form.parent_id || null,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export async function listCategories() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });

  if (error) {
    console.error('[CITYMO] categories list', error);
    throw error;
  }

  const rows = data || [];
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.nom]));
  return rows.map((r) => normalizeCategorie(r, r.parent_id ? byId[r.parent_id] : ''));
}

export async function createCategorie(form) {
  await getAuthUserId();
  const row = toCategorieRow(form);

  if (!row.nom) {
    const err = new Error('Nom requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] categories insert', error, row);
    throw error;
  }
  return normalizeCategorie(data);
}

export async function updateCategorie(id, form) {
  await getAuthUserId();
  const row = toCategorieRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] categories update', error, { id, row });
    throw error;
  }
  return normalizeCategorie(data);
}

export async function deleteCategorie(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] categories delete', error, { id });
    throw error;
  }
}

export function filterCategories(records, filters = {}) {
  const { search = '', statut = '' } = filters;
  return (records || []).filter((c) => {
    if (statut && c.statut !== statut) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${c.nom || ''} ${c.slug || ''} ${c.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeCategoriesStats(records, articleCount = 0) {
  const list = records || [];
  return {
    total: list.length,
    actives: list.filter((c) => c.statut === 'actif').length,
    totalArticles: articleCount,
  };
}
