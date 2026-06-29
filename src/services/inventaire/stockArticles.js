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
    barcode_value: row.barcode_value || row.reference || '',
    last_scanned_at: row.last_scanned_at || null,
    current_state: row.current_state || 'Disponible',
    stock_actuel: Number(extras.stock_actuel ?? row.stock_actuel ?? 0),
    dernier_mouvement: extras.dernier_mouvement ?? null,
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toStockArticleRow(form) {
  const { warehouseId, projectId } = parseLocalisation(form);
  const reference = (form.code || form.reference || '').trim();
  const row = {
    reference,
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
  if (reference) row.barcode_value = reference;
  return row;
}

function isMissingBarcodeColumn(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (error?.code === '42703' || error?.code === 'PGRST204')
    && (msg.includes('barcode_value') || msg.includes('last_scanned_at') || msg.includes('current_state'));
}

async function insertArticleRow(row) {
  let payload = { ...row };
  let { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error && isMissingBarcodeColumn(error)) {
    const { barcode_value, last_scanned_at, ...rest } = payload;
    ({ data, error } = await getSupabase().from(TABLE).insert([rest]).select().single());
  }
  if (error) throw error;
  return data;
}

async function updateArticleRow(id, row) {
  let payload = { ...row };
  let { data, error } = await getSupabase().from(TABLE).update(payload).eq('id', id).select().single();
  if (error && isMissingBarcodeColumn(error)) {
    const { barcode_value, last_scanned_at, ...rest } = payload;
    ({ data, error } = await getSupabase().from(TABLE).update(rest).eq('id', id).select().single());
  }
  if (error) throw error;
  return data;
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

function fmtMvtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function summarizeLastMovement(row) {
  if (!row) return null;
  const p = row.payload || {};
  const action = p.action_label || row.motif || row.type_mouvement || 'Mouvement';
  return {
    date: row.date_mouvement || '',
    date_label: fmtMvtDate(row.date_mouvement),
    action,
    type: row.type_mouvement || '',
    ref: row.ref_mouvement || '',
  };
}

async function attachLastMovements(articles) {
  if (!articles.length) return articles;
  const ids = articles.map((a) => a.id);
  const { data, error } = await getSupabase()
    .from(MOVEMENTS)
    .select('article_id, date_mouvement, type_mouvement, motif, ref_mouvement, payload, created_at')
    .in('article_id', ids)
    .order('date_mouvement', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return articles;
    throw error;
  }
  const lastByArticle = new Map();
  (data || []).forEach((row) => {
    if (!lastByArticle.has(row.article_id)) lastByArticle.set(row.article_id, row);
  });
  return articles.map((a) => ({
    ...a,
    dernier_mouvement: summarizeLastMovement(lastByArticle.get(a.id)),
  }));
}

export async function listStockArticles() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });
  if (error) throw error;
  const normalized = (data || []).map((r) => normalizeStockArticle(r)).filter(Boolean);
  const withStock = await attachStockQuantities(normalized);
  return attachLastMovements(withStock);
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
    }).map((r) => ({ ...r, barcode_value: r.reference }));
    if (!toInsert.length) return { seeded: 0, skipped: true };

    let { error } = await getSupabase().from(TABLE).insert(toInsert);
    if (error && isMissingBarcodeColumn(error)) {
      const stripped = toInsert.map(({ barcode_value, ...r }) => r);
      ({ error } = await getSupabase().from(TABLE).insert(stripped));
    }
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
  row.barcode_value = row.reference;
  if (!row.nom) {
    const err = new Error('La désignation est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }

  const data = await insertArticleRow(row);

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
  const data = await updateArticleRow(id, row);
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
  return (data || []).map(formatArticleMovementHistory);
}

export function formatArticleMovementHistory(m) {
  const p = m.payload || {};
  const typeLabel = {
    Entree: 'Entrée',
    Sortie: 'Sortie',
    Transfert: 'Transfert',
    Retour: 'Retour',
    Rebut: 'Réforme',
    Reparation: 'Réparation',
    Reforme: 'Réforme',
  }[m.type_mouvement] || m.type_mouvement || '';
  return {
    id: m.id,
    ref: m.ref_mouvement || '',
    type: typeLabel,
    type_raw: m.type_mouvement || '',
    quantite: Number(m.quantite ?? 0),
    date: m.date_mouvement || '',
    date_label: fmtMvtDate(m.date_mouvement),
    motif: m.motif || '',
    utilisateur: p.cree_par || p.utilisateur || '—',
    action: p.action_label || m.motif || typeLabel || 'Mouvement',
    origine: p.emplacement_source || '',
    destination: p.emplacement_destination || '',
    observation: p.note || p.ligne_notes || '',
    warehouse_id: m.warehouse_id,
    payload: p,
    created_at: m.created_at,
  };
}

export async function patchStockArticle(id, fields = {}) {
  await requireSupabaseUserId();
  const row = {};
  if (fields.current_state !== undefined) row.current_state = fields.current_state || 'Disponible';
  if (fields.emplacement !== undefined) row.emplacement = (fields.emplacement || '').trim() || null;
  if (fields.last_scanned_at !== undefined) row.last_scanned_at = fields.last_scanned_at;
  if (!Object.keys(row).length) return null;

  let { data, error } = await getSupabase().from(TABLE).update(row).eq('id', id).select().single();
  if (error && isMissingBarcodeColumn(error)) {
    const { current_state, last_scanned_at, ...rest } = row;
    if (!Object.keys(rest).length) return null;
    ({ data, error } = await getSupabase().from(TABLE).update(rest).eq('id', id).select().single());
  }
  if (error) throw error;
  const [withStock] = await attachStockQuantities([normalizeStockArticle(data)]);
  return withStock;
}

export async function computeArticleStock(articleId) {
  const sums = await sumLevelsByArticle([articleId]);
  if (sums && sums[articleId] !== undefined) {
    return Math.max(0, Number(sums[articleId]));
  }
  const fromMvts = await sumMovementsByArticle([articleId]);
  return Math.max(0, Number(fromMvts[articleId] ?? 0));
}

function matchBarcodeArticle(article, code) {
  const norm = String(code || '').trim().toLowerCase();
  if (!norm) return false;
  const ref = String(article.reference || article.code || '').trim().toLowerCase();
  const bc = String(article.barcode_value || '').trim().toLowerCase();
  return ref === norm || bc === norm;
}

/** Recherche locale : barcode_value puis référence. */
export function findStockArticleInList(articles, rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;
  const norm = code.toLowerCase();
  const byBarcode = articles.find((a) => String(a.barcode_value || '').trim().toLowerCase() === norm);
  if (byBarcode) return byBarcode;
  return articles.find((a) => {
    const ref = String(a.reference || a.code || '').trim().toLowerCase();
    return ref === norm;
  }) || null;
}

/** Recherche article par scan : Code128 / QR → barcode_value, puis référence. */
export async function findStockArticleByBarcode(rawCode, localArticles = []) {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const local = findStockArticleInList(localArticles, code);
  if (local) return local;

  const { data: byBc, error: bcErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .ilike('barcode_value', code)
    .limit(1)
    .maybeSingle();
  if (bcErr) {
    if (!isMissingBarcodeColumn(bcErr)) throw bcErr;
  } else if (byBc) {
    const [withStock] = await attachStockQuantities([normalizeStockArticle(byBc)]);
    return withStock;
  }

  const { data: byRef, error: refErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .ilike('reference', code)
    .limit(1)
    .maybeSingle();
  if (refErr) throw refErr;
  if (!byRef) return null;
  const [withStock] = await attachStockQuantities([normalizeStockArticle(byRef)]);
  return withStock;
}

/** Enregistre la date du dernier scan (colonne optionnelle). */
export async function recordStockArticleScan(id) {
  if (!id) return;
  try {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('id', id);
    if (error && !isMissingBarcodeColumn(error)) throw error;
  } catch {
    /* colonne absente si SQL non exécuté */
  }
}
