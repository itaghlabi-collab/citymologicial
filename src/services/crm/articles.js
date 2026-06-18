/**
 * articles.js — CRM Articles CRUD (Supabase public.articles)
 */
import { getSupabase } from '../../lib/supabase';
import { categoryRefPrefix, nextReferenceForPrefix } from '../../utils/crm/articleReference';
import { listCategories } from './categories';

const TABLE = 'articles';

export const ARTICLE_STATUTS = ['actif', 'inactif', 'archive'];

export const ARTICLE_STATUT_LABEL = {
  actif: 'Actif',
  inactif: 'Inactif',
  archive: 'Archive',
};

/** DB row → shape Articles.jsx (champs UI supplementaires : defaults locaux) */
export function normalizeArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom || '',
    prix_ht: Number(row.prix ?? 0),
    unite: row.unite || 'unite',
    remise: Number(row.remise ?? 0),
    statut: row.statut || 'actif',
    categorie_id: row.categorie_id ? String(row.categorie_id) : '',
    description: row.description || '',
    reference: row.reference || '',
    tva: 20,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row (colonnes Supabase uniquement) */
export function toArticleRow(form) {
  return {
    nom: form.nom?.trim() || '',
    prix: Number(form.prix_ht ?? form.prix ?? 0),
    unite: form.unite || 'unite',
    remise: Number(form.remise) || 0,
    statut: form.statut || 'actif',
    categorie_id: form.categorie_id && String(form.categorie_id).trim()
      ? form.categorie_id
      : null,
    reference: form.reference?.trim() || null,
    description: form.description?.trim() || null,
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

async function listExistingReferences() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('reference')
    .not('reference', 'is', null);
  if (error) throw error;
  return (data || []).map((r) => r.reference).filter(Boolean);
}

/** Génère une référence courte (ex. E001, CL002) selon la catégorie. */
export async function generateArticleReference(categorieId, existingRefs = null) {
  const refs = existingRefs || await listExistingReferences();
  let prefix = 'A';

  if (categorieId) {
    const categories = await listCategories();
    const cat = categories.find((c) => String(c.id) === String(categorieId));
    const noms = categories.map((c) => c.nom);
    if (cat?.nom) {
      prefix = categoryRefPrefix(cat.nom, noms);
    }
  }

  return nextReferenceForPrefix(prefix, refs);
}

export async function listArticles() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });

  if (error) {
    console.error('[CITYMO] articles list', error);
    throw error;
  }
  return (data || []).map(normalizeArticle);
}

/** Attribue les références manquantes aux articles existants. */
export async function backfillMissingArticleReferences() {
  await getAuthUserId();
  const { data: rows, error } = await getSupabase()
    .from(TABLE)
    .select('id, reference, categorie_id, nom')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const categories = await listCategories();
  const noms = categories.map((c) => c.nom);
  const refs = (rows || []).map((r) => r.reference).filter(Boolean);
  const missing = (rows || []).filter((r) => !r.reference?.trim());

  for (const row of missing) {
    let prefix = 'A';
    if (row.categorie_id) {
      const cat = categories.find((c) => String(c.id) === String(row.categorie_id));
      if (cat?.nom) prefix = categoryRefPrefix(cat.nom, noms);
    }
    const reference = nextReferenceForPrefix(prefix, refs);
    refs.push(reference);
    await getSupabase().from(TABLE).update({ reference }).eq('id', row.id);
  }

  return missing.length;
}

export async function createArticle(form) {
  await getAuthUserId();
  const row = toArticleRow(form);

  if (!row.nom) {
    const err = new Error('Nom requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!row.reference) {
    row.reference = await generateArticleReference(form.categorie_id);
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] articles insert', error, row);
    throw error;
  }
  return normalizeArticle(data);
}

export async function updateArticle(id, form) {
  await getAuthUserId();
  const row = toArticleRow(form);

  if (!row.reference) {
    row.reference = await generateArticleReference(form.categorie_id);
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] articles update', error, { id, row });
    throw error;
  }
  return normalizeArticle(data);
}

export async function deleteArticle(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] articles delete', error, { id });
    throw error;
  }
}

export async function duplicateArticle(id) {
  await getAuthUserId();
  const { data: row, error: fetchError } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !row) {
    console.error('[CITYMO] articles duplicate fetch', fetchError, { id });
    throw fetchError || new Error('Article introuvable.');
  }

  const reference = await generateArticleReference(row.categorie_id);

  const copy = {
    nom: `${row.nom} (copie)`,
    prix: row.prix,
    unite: row.unite,
    remise: row.remise ?? 0,
    statut: row.statut || 'actif',
    categorie_id: row.categorie_id,
    reference,
    description: row.description || null,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([copy])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] articles duplicate insert', error, copy);
    throw error;
  }
  return normalizeArticle(data);
}

export function filterArticles(records, filters = {}) {
  const {
    search = '',
    categorie_id = '',
    statut = '',
    catName = () => '-',
  } = filters;

  return (records || []).filter((a) => {
    if (statut && a.statut !== statut) return false;
    if (categorie_id === '__none__') {
      if (a.categorie_id) return false;
    } else if (categorie_id && String(a.categorie_id) !== String(categorie_id)) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = `${a.nom || ''} ${a.reference || ''} ${catName(a.categorie_id)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeArticlesStats(records) {
  const list = records || [];
  const actifs = list.filter((a) => a.statut === 'actif');
  return {
    total: list.length,
    actifs: actifs.length,
    usedCategories: new Set(list.map((a) => a.categorie_id).filter(Boolean)).size,
    prixMoyen: list.length
      ? list.reduce((s, a) => s + Number(a.prix_ht || 0), 0) / list.length
      : 0,
    avecRemise: list.filter((a) => Number(a.remise) > 0).length,
  };
}
