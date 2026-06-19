/**
 * stockArticles.js — Articles de stock (Supabase stock_articles + stock_levels + stock_movements)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';
import { buildSeedRows } from './stockArticlesSeed';
import { listStockCategories } from './stockCategories';

const TABLE = 'stock_articles';
const LEVELS = 'stock_levels';
const MOVEMENTS = 'stock_movements';

let catalogImportPromise = null;

const STATUT_UI = {
  Active: 'Actif',
  Inactive: 'Inactif',
  Archive: 'Archivé',
  Archived: 'Archivé',
};

const STATUT_DB = {
  Actif: 'Active',
  Inactif: 'Inactive',
  Archivé: 'Archive',
};

export function movementDelta(type, qty) {
  const t = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const q = Number(qty) || 0;
  if (t.includes('entree') || t.includes('retour')) return q;
  if (t.includes('sortie') || t.includes('rebut')) return -q;
  return 0;
}

function statutFromDb(statut) {
  if (!statut) return 'Actif';
  return STATUT_UI[statut] || statut;
}

function statutToDb(statut) {
  return STATUT_DB[statut] || statut || 'Active';
}

function parseLocalisation(form) {
  const raw = form.localisation_id || form.localisation_initiale || '';
  if (String(raw).startsWith('depot:')) {
    return { warehouseId: raw.replace('depot:', ''), projectId: null };
  }
  if (String(raw).startsWith('project:')) {
    return { warehouseId: null, projectId: raw.replace('project:', '') };
  }
  if (form.localisation_kind === 'project' || form.projet_lie) {
    return { warehouseId: null, projectId: form.default_project_id || form.projet_lie || raw || null };
  }
  return {
    warehouseId: form.default_warehouse_id || form.depot_id || raw || null,
    projectId: null,
  };
}

export function normalizeStockArticle(row, extras = {}) {
  if (!row) return null;
  const warehouseId = row.default_warehouse_id ? String(row.default_warehouse_id) : '';
  const projectId = row.default_project_id ? String(row.default_project_id) : '';
  const localisationId = projectId ? `project:${projectId}` : warehouseId ? `depot:${warehouseId}` : '';
  return {
    id: row.id,
    code: row.reference || '',
    reference: row.reference || '',
    designation: row.nom || '',
    nom: row.nom || '',
    type: row.article_type || '',
    article_type: row.article_type || '',
    categorie_id: row.category_id ? String(row.category_id) : '',
    category_id: row.category_id || null,
    numero_serie: row.numero_serie || '',
    unite: row.unite || 'U',
    valeur: Number(row.prix_unitaire ?? 0),
    prix_unitaire: Number(row.prix_unitaire ?? 0),
    stock_minimum: Number(row.seuil_alerte ?? 0),
    seuil_alerte: Number(row.seuil_alerte ?? 0),
    etat: row.etat || 'Neuf',
    statut: statutFromDb(row.statut),
    default_warehouse_id: warehouseId,
    default_project_id: projectId,
    depot_id: warehouseId,
    projet_lie: projectId,
    localisation_kind: projectId ? 'project' : 'depot',
    localisation_id: localisationId,
    emplacement: row.emplacement || '',
    description: row.description || '',
    notes: row.notes || '',
    stock_actuel: Number(extras.stock_actuel ?? row.stock_actuel ?? 0),
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toStockArticleRow(form) {
  const { warehouseId, projectId } = parseLocalisation(form);
  return {
    reference: (form.code || form.reference || '').trim(),
    nom: (form.designation || form.nom || '').trim(),
    article_type: (form.type || form.article_type || '').trim() || null,
    category_id: form.categorie_id || form.category_id || null,
    numero_serie: (form.numero_serie || '').trim() || null,
    unite: form.unite || 'U',
    prix_unitaire: Number(form.valeur ?? form.prix_unitaire) || 0,
    seuil_alerte: Number(form.stock_minimum ?? form.seuil_alerte) || 0,
    etat: form.etat || 'Neuf',
    statut: statutToDb(form.statut),
    default_warehouse_id: warehouseId || null,
    default_project_id: projectId || null,
    emplacement: (form.emplacement || '').trim() || null,
    description: (form.description || '').trim() || null,
    notes: (form.notes || '').trim() || null,
  };
}

export async function generateStockArticleCode() {
  const y = new Date().getFullYear();
  const prefix = `ART-${y}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('reference')
    .ilike('reference', `${prefix}%`);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.reference || '').match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

async function sumLevelsByArticle(articleIds) {
  const sums = {};
  if (!articleIds.length) return sums;
  const { data, error } = await getSupabase()
    .from(LEVELS)
    .select('article_id, quantite')
    .in('article_id', articleIds);
  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }
  (data || []).forEach((l) => {
    sums[l.article_id] = (sums[l.article_id] || 0) + Number(l.quantite || 0);
  });
  return sums;
}

async function sumMovementsByArticle(articleIds) {
  const sums = {};
  if (!articleIds.length) return sums;
  const { data, error } = await getSupabase()
    .from(MOVEMENTS)
    .select('article_id, type_mouvement, quantite')
    .in('article_id', articleIds);
  if (error) throw error;
  (data || []).forEach((m) => {
    if (!m.article_id) return;
    sums[m.article_id] = (sums[m.article_id] || 0) + movementDelta(m.type_mouvement, m.quantite);
  });
  return sums;
}

async function attachStockQuantities(articles) {
  if (!articles.length) return articles;
  const ids = articles.map((a) => a.id);
  let sums = await sumLevelsByArticle(ids);
  if (sums === null) {
    sums = await sumMovementsByArticle(ids);
  } else {
    const empty = ids.filter((id) => sums[id] === undefined);
    if (empty.length) {
      const fromMvts = await sumMovementsByArticle(empty);
      Object.assign(sums, fromMvts);
    }
  }
  return articles.map((a) => ({
    ...a,
    stock_actuel: Math.max(0, Number(sums[a.id] ?? a.stock_actuel ?? 0)),
  }));
}

export async function listStockArticles() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });
  if (error) throw error;
  const normalized = (data || []).map((r) => normalizeStockArticle(r)).filter(Boolean);
  return attachStockQuantities(normalized);
}

/** Détecte les doublons (même référence ou même désignation). */
export function findStockArticleDuplicates(articles = []) {
  const byRef = new Map();
  const byNom = new Map();
  const dupIds = new Set();
  for (const a of articles) {
    const ref = String(a.reference || a.code || '').trim().toLowerCase();
    const nom = String(a.nom || a.designation || '').trim().toLowerCase();
    if (ref) {
      if (byRef.has(ref)) {
        dupIds.add(a.id);
        dupIds.add(byRef.get(ref));
      } else byRef.set(ref, a.id);
    }
    if (nom) {
      if (byNom.has(nom)) {
        dupIds.add(a.id);
        dupIds.add(byNom.get(nom));
      } else byNom.set(nom, a.id);
    }
  }
  return { count: dupIds.size, ids: [...dupIds] };
}

/** Importe les articles catalogue manquants (43 articles CITYMO). Déduplication par code + désignation. */
export async function importStockArticlesCatalog() {
  if (catalogImportPromise) return catalogImportPromise;
  catalogImportPromise = (async () => {
    await requireSupabaseUserId();
    const categories = await listStockCategories().catch(() => []);
    const rows = buildSeedRows(categories);

    const { data: existing, error: listErr } = await getSupabase()
      .from(TABLE)
      .select('reference, nom');
    if (listErr) throw listErr;

    const existingRefs = new Set(
      (existing || []).map((r) => String(r.reference || '').trim().toLowerCase()).filter(Boolean),
    );
    const existingNoms = new Set(
      (existing || []).map((r) => String(r.nom || '').trim().toLowerCase()).filter(Boolean),
    );
    const toInsert = rows.filter((r) => {
      const ref = String(r.reference).trim().toLowerCase();
      const nom = String(r.nom).trim().toLowerCase();
      if (existingRefs.has(ref)) return false;
      if (existingNoms.has(nom)) return false;
      return true;
    });
    if (!toInsert.length) return { seeded: 0, skipped: true };

    const { error } = await getSupabase().from(TABLE).insert(toInsert);
    if (error) throw error;
    return { seeded: toInsert.length, skipped: false };
  })();
  try {
    return await catalogImportPromise;
  } finally {
    catalogImportPromise = null;
  }
}

/** Import catalogue au premier chargement si table vide (déduplication stricte). */
export async function seedStockArticlesIfEmpty() {
  const { count, error: countErr } = await getSupabase()
    .from(TABLE)
    .select('id', { count: 'exact', head: true });
  if (countErr) throw countErr;
  if (count > 0) return { seeded: 0, skipped: true };
  return importStockArticlesCatalog();
}

/** Supprime les doublons en conservant l'enregistrement le plus ancien (référence ou désignation). */
export async function dedupeStockArticles() {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, reference, nom, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const keepIds = new Set();
  const deleteIds = [];
  const seenRef = new Map();
  const seenNom = new Map();

  for (const row of data || []) {
    const ref = String(row.reference || '').trim().toLowerCase();
    const nom = String(row.nom || '').trim().toLowerCase();
    let isDup = false;
    if (ref && seenRef.has(ref)) isDup = true;
    if (nom && seenNom.has(nom)) isDup = true;
    if (isDup) {
      deleteIds.push(row.id);
      continue;
    }
    keepIds.add(row.id);
    if (ref) seenRef.set(ref, row.id);
    if (nom) seenNom.set(nom, row.id);
  }

  if (!deleteIds.length) return { removed: 0 };

  const { error: delErr } = await getSupabase()
    .from(TABLE)
    .delete()
    .in('id', deleteIds);
  if (delErr) throw delErr;
  return { removed: deleteIds.length };
}

export async function getStockArticleById(id) {
  if (!id) return null;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  const [withStock] = await attachStockQuantities([normalizeStockArticle(data)]);
  return withStock;
}

async function createInitialStock(articleId, form, qty, uid) {
  const locRaw = form.localisation_initiale || form.localisation_id || '';
  let warehouseId = null;
  let projectId = null;
  if (String(locRaw).startsWith('depot:')) warehouseId = locRaw.replace('depot:', '');
  else if (String(locRaw).startsWith('project:')) projectId = locRaw.replace('project:', '');
  else {
    const parsed = parseLocalisation({
      ...form,
      localisation_id: locRaw || form.localisation_id,
      localisation_kind: form.localisation_initiale_kind || form.localisation_kind,
    });
    warehouseId = parsed.warehouseId;
    projectId = parsed.projectId;
  }

  const emplacement = (form.emplacement_initial || form.emplacement || '').trim() || null;
  const levelRow = {
    article_id: articleId,
    warehouse_id: warehouseId || null,
    project_id: projectId || null,
    emplacement,
    quantite: qty,
  };

  const { error: levelErr } = await getSupabase().from(LEVELS).insert([levelRow]);
  if (levelErr && levelErr.code !== '42P01') throw levelErr;

  const y = new Date().getFullYear();
  const ref = `MVT-${y}-${String(Date.now()).slice(-6)}`;
  const { error: mvtErr } = await getSupabase().from(MOVEMENTS).insert([{
    ref_mouvement: ref,
    type_mouvement: 'Entree',
    article_id: articleId,
    warehouse_id: warehouseId || null,
    quantite: qty,
    date_mouvement: new Date().toISOString().slice(0, 10),
    motif: 'Stock initial à la création article',
    payload: { project_id: projectId, emplacement, source: 'article_creation' },
    created_by: uid,
  }]);
  if (mvtErr) throw mvtErr;
}

export async function createStockArticle(form) {
  const uid = await requireSupabaseUserId();
  const row = toStockArticleRow(form);
  if (!row.reference) row.reference = await generateStockArticleCode();
  if (!row.nom) {
    const err = new Error('La désignation est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) throw error;

  const article = normalizeStockArticle(data);
  const qty = Number(form.quantite_initiale) || 0;
  if (qty > 0) {
    await createInitialStock(article.id, form, qty, uid);
  }
  const [withStock] = await attachStockQuantities([article]);
  return withStock;
}

export async function updateStockArticle(id, form) {
  await requireSupabaseUserId();
  const row = toStockArticleRow(form);
  if (!row.nom) {
    const err = new Error('La désignation est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const [withStock] = await attachStockQuantities([normalizeStockArticle(data)]);
  return withStock;
}

export async function archiveStockArticle(id) {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'Archive' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const [withStock] = await attachStockQuantities([normalizeStockArticle(data)]);
  return withStock;
}

export async function deleteStockArticle(id) {
  await requireSupabaseUserId();

  const { count: mvtCount, error: mvtErr } = await getSupabase()
    .from(MOVEMENTS)
    .select('id', { count: 'exact', head: true })
    .eq('article_id', id);
  if (mvtErr) throw mvtErr;
  if (mvtCount > 0) {
    throw new Error('Impossible de supprimer : des mouvements sont liés à cet article. Archivez-le plutôt.');
  }

  const sums = await sumLevelsByArticle([id]);
  const qty = sums?.[id] ?? 0;
  if (qty > 0) {
    throw new Error('Impossible de supprimer : le stock n\'est pas nul. Archivez l\'article plutôt.');
  }

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listMovementsForArticle(articleId) {
  if (!articleId) return [];
  const { data, error } = await getSupabase()
    .from(MOVEMENTS)
    .select('*')
    .eq('article_id', articleId)
    .order('date_mouvement', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((m) => ({
    id: m.id,
    ref: m.ref_mouvement || '',
    type: m.type_mouvement || '',
    quantite: Number(m.quantite ?? 0),
    date: m.date_mouvement || '',
    motif: m.motif || '',
    warehouse_id: m.warehouse_id,
    payload: m.payload || {},
    created_at: m.created_at,
  }));
}

export async function computeArticleStock(articleId) {
  const sums = await sumLevelsByArticle([articleId]);
  if (sums && sums[articleId] !== undefined) {
    return Math.max(0, Number(sums[articleId]));
  }
  const fromMvts = await sumMovementsByArticle([articleId]);
  return Math.max(0, Number(fromMvts[articleId] ?? 0));
}
