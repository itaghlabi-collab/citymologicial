/**
 * stockMovements.js — Bons de mouvement multi-lignes (Supabase stock_movements + stock_levels)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';
import { movementDelta } from './stockArticles';

const TABLE = 'stock_movements';
const LEVELS = 'stock_levels';
const ARTICLES = 'stock_articles';

const TYPE_TO_DB = {
  Entrée: 'Entree',
  Sortie: 'Sortie',
  Transfert: 'Transfert',
  Retour: 'Retour',
  Rebut: 'Rebut',
};

const TYPE_FROM_DB = {
  Entree: 'Entrée',
};

function typeToDb(type) {
  return TYPE_TO_DB[type] || type || 'Entree';
}

function typeFromDb(type) {
  return TYPE_FROM_DB[type] || type || 'Entrée';
}

function shouldApplyStock(statut) {
  return statut === 'Validé' || statut === 'Terminé';
}

export function normalizeStockMovement(row, article = null) {
  if (!row) return null;
  const p = row.payload || {};
  const art = article || row.stock_articles || null;
  return {
    id: row.id,
    ref: row.ref_mouvement || '',
    type_mouvement: typeFromDb(row.type_mouvement),
    article_id: row.article_id ? String(row.article_id) : '',
    article_code: art?.reference || '',
    article_designation: art?.nom || '',
    quantite: Number(row.quantite ?? 0),
    emplacement_source: p.emplacement_source || '',
    emplacement_destination: p.emplacement_destination || '',
    date_creation: row.date_mouvement || '',
    cree_par: p.cree_par || '',
    livreur: p.livreur || '',
    receptionnaire: p.receptionnaire || '',
    motif: row.motif || '',
    note: p.note || '',
    statut: p.statut || 'Brouillon',
    applied: !!p.applied,
    ligne_notes: p.ligne_notes || '',
    ligne_index: p.ligne_index ?? 0,
    created_at: row.created_at,
  };
}

export function normalizeBonFromRows(rows) {
  if (!rows?.length) return null;
  const items = rows.map((row) => normalizeStockMovement(row));
  const first = items[0];
  const lignes = items
    .sort((a, b) => (a.ligne_index ?? 0) - (b.ligne_index ?? 0))
    .map((m) => ({
      id: m.id,
      article_id: m.article_id,
      article_code: m.article_code,
      article_designation: m.article_designation,
      quantite: m.quantite,
      notes: m.ligne_notes || '',
    }));

  return {
    ref: first.ref,
    type_mouvement: first.type_mouvement,
    emplacement_source: first.emplacement_source,
    emplacement_destination: first.emplacement_destination,
    date_creation: first.date_creation,
    cree_par: first.cree_par,
    livreur: first.livreur,
    receptionnaire: first.receptionnaire,
    motif: first.motif,
    note: first.note,
    statut: first.statut,
    applied: items.every((m) => m.applied),
    lignes,
    quantite_totale: lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0),
  };
}

function bonHeaderPayload(bon, statut, applied = false) {
  return {
    emplacement_source: (bon.emplacement_source || '').trim(),
    emplacement_destination: (bon.emplacement_destination || '').trim(),
    cree_par: (bon.cree_par || '').trim(),
    livreur: (bon.livreur || '').trim(),
    receptionnaire: (bon.receptionnaire || '').trim(),
    note: (bon.note || '').trim(),
    statut: statut || bon.statut || 'Brouillon',
    applied,
  };
}

function toMovementRowFromBon(bon, ligne, idx, uid, ref, statut, applied) {
  return {
    ref_mouvement: ref,
    type_mouvement: typeToDb(bon.type_mouvement),
    article_id: ligne.article_id || null,
    warehouse_id: null,
    quantite: Number(ligne.quantite) || 0,
    date_mouvement: bon.date_creation || new Date().toISOString().slice(0, 10),
    motif: (bon.motif || '').trim() || null,
    payload: {
      ...bonHeaderPayload(bon, statut, applied),
      ligne_notes: (ligne.notes || '').trim(),
      ligne_index: idx,
    },
    created_by: uid,
  };
}

export async function generateMovementRef() {
  const y = new Date().getFullYear();
  const prefix = `BM-${y}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref_mouvement')
    .ilike('ref_mouvement', `${prefix}%`);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.ref_mouvement || '').match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function listStockMovements() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .order('date_mouvement', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => normalizeStockMovement(row));
}

export async function listStockMovementBons() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .order('date_mouvement', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const byRef = new Map();
  (data || []).forEach((row) => {
    const ref = row.ref_mouvement || row.id;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(row);
  });

  return Array.from(byRef.values())
    .map(normalizeBonFromRows)
    .filter(Boolean)
    .sort((a, b) => String(b.date_creation).localeCompare(String(a.date_creation)));
}

export async function getStockMovementBon(ref) {
  if (!ref) return null;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .eq('ref_mouvement', ref)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return normalizeBonFromRows(data || []);
}

async function findLevel(articleId, emplacement) {
  const emp = (emplacement || '').trim();
  if (!articleId || !emp) return null;
  const { data, error } = await getSupabase()
    .from(LEVELS)
    .select('*')
    .eq('article_id', articleId)
    .eq('emplacement', emp)
    .limit(1);
  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }
  return data?.[0] || null;
}

async function adjustLevel(articleId, emplacement, delta) {
  const emp = (emplacement || '').trim();
  const d = Number(delta) || 0;
  if (!articleId || !emp || !d) return;

  const existing = await findLevel(articleId, emp);
  if (existing) {
    const newQty = Number(existing.quantite || 0) + d;
    if (newQty < 0) {
      const err = new Error(`Stock insuffisant à l'emplacement « ${emp} ».`);
      err.code = 'VALIDATION';
      throw err;
    }
    const { error } = await getSupabase()
      .from(LEVELS)
      .update({ quantite: newQty })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  if (d < 0) {
    const err = new Error(`Aucun stock à l'emplacement « ${emp} ».`);
    err.code = 'VALIDATION';
    throw err;
  }

  const { error } = await getSupabase().from(LEVELS).insert([{
    article_id: articleId,
    warehouse_id: null,
    project_id: null,
    emplacement: emp,
    quantite: d,
  }]);
  if (error && error.code !== '42P01') throw error;
}

async function updateArticleEmplacement(articleId, emplacement) {
  const emp = (emplacement || '').trim();
  if (!articleId || !emp) return;
  const { error } = await getSupabase()
    .from(ARTICLES)
    .update({ emplacement: emp })
    .eq('id', articleId);
  if (error) throw error;
}

async function applyMovementEffects(mvt, reverse = false) {
  const qty = Number(mvt.quantite) || 0;
  if (!mvt.article_id || qty <= 0) return;

  const sign = reverse ? -1 : 1;
  const type = mvt.type_mouvement;
  const src = mvt.emplacement_source;
  const dest = mvt.emplacement_destination;

  if (type === 'Entrée') {
    await adjustLevel(mvt.article_id, dest, sign * qty);
    if (!reverse) await updateArticleEmplacement(mvt.article_id, dest);
  } else if (type === 'Sortie' || type === 'Rebut') {
    await adjustLevel(mvt.article_id, src, sign * -qty);
  } else if (type === 'Transfert' || type === 'Retour') {
    await adjustLevel(mvt.article_id, src, sign * -qty);
    await adjustLevel(mvt.article_id, dest, sign * qty);
    if (!reverse) await updateArticleEmplacement(mvt.article_id, dest);
  }
}

async function applyBonEffects(bon, reverse = false) {
  for (const ligne of bon.lignes || []) {
    await applyMovementEffects({
      type_mouvement: bon.type_mouvement,
      article_id: ligne.article_id,
      quantite: ligne.quantite,
      emplacement_source: bon.emplacement_source,
      emplacement_destination: bon.emplacement_destination,
    }, reverse);
  }
}

function validateBonForm(bon) {
  const type = bon.type_mouvement;
  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(type);
  const needsDest = ['Entrée', 'Transfert', 'Retour'].includes(type);

  if (!bon.lignes?.length) {
    const err = new Error('Ajoutez au moins une ligne article.');
    err.code = 'VALIDATION';
    throw err;
  }

  bon.lignes.forEach((ligne, idx) => {
    if (!ligne.article_id) {
      const err = new Error(`Ligne ${idx + 1} : sélectionnez un article.`);
      err.code = 'VALIDATION';
      throw err;
    }
    if (!ligne.quantite || Number(ligne.quantite) <= 0) {
      const err = new Error(`Ligne ${idx + 1} : quantité invalide.`);
      err.code = 'VALIDATION';
      throw err;
    }
  });

  if (needsSource && !(bon.emplacement_source || '').trim()) {
    const err = new Error('Emplacement source requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (needsDest && !(bon.emplacement_destination || '').trim()) {
    const err = new Error('Emplacement destination requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (type === 'Transfert' && bon.emplacement_source === bon.emplacement_destination) {
    const err = new Error('Source et destination doivent être différentes.');
    err.code = 'VALIDATION';
    throw err;
  }
}

async function deleteBonRows(ref, reverseIfApplied = false) {
  const bon = await getStockMovementBon(ref);
  if (!bon) return;
  if (reverseIfApplied && bon.applied) {
    await applyBonEffects(bon, true);
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('ref_mouvement', ref);
  if (error) throw error;
}

async function markBonApplied(ref, statut) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, payload')
    .eq('ref_mouvement', ref);
  if (error) throw error;
  await Promise.all((data || []).map((row) => getSupabase()
    .from(TABLE)
    .update({ payload: { ...(row.payload || {}), statut, applied: true } })
    .eq('id', row.id)));
}

export async function saveStockMovementBon(bon) {
  const uid = await requireSupabaseUserId();
  validateBonForm(bon);

  const ref = (bon.ref || '').trim() || await generateMovementRef();
  const existing = bon.ref ? await getStockMovementBon(bon.ref) : null;

  if (existing?.applied) {
    const err = new Error('Ce bon est déjà validé et ne peut plus être modifié.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (existing) {
    await deleteBonRows(bon.ref, false);
  }

  const applyNow = shouldApplyStock(bon.statut);
  const rows = (bon.lignes || []).map((ligne, idx) => toMovementRowFromBon(
    bon, ligne, idx, uid, ref, bon.statut, false,
  ));

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(rows)
    .select('*, stock_articles(reference, nom)');
  if (error) throw error;

  const savedBon = normalizeBonFromRows(data);
  if (applyNow) {
    await applyBonEffects(savedBon);
    await markBonApplied(ref, bon.statut);
    savedBon.applied = true;
  }
  return savedBon;
}

export async function validateStockMovementBon(ref) {
  await requireSupabaseUserId();
  const bon = await getStockMovementBon(ref);
  if (!bon) {
    const err = new Error('Bon introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (bon.applied) {
    const err = new Error('Bon déjà validé.');
    err.code = 'VALIDATION';
    throw err;
  }
  validateBonForm(bon);
  await applyBonEffects(bon);
  await markBonApplied(ref, 'Validé');
  return getStockMovementBon(ref);
}

export async function deleteStockMovementBon(ref) {
  await requireSupabaseUserId();
  await deleteBonRows(ref, true);
}

/** @deprecated single-line — use saveStockMovementBon */
export async function createStockMovement(form) {
  return saveStockMovementBon({
    ...form,
    lignes: [{ article_id: form.article_id, quantite: form.quantite, notes: '' }],
  });
}

/** @deprecated single-line */
export async function updateStockMovement(id, form) {
  const { data, error } = await getSupabase().from(TABLE).select('ref_mouvement').eq('id', id).single();
  if (error) throw error;
  return saveStockMovementBon({
    ...form,
    ref: data.ref_mouvement,
    lignes: [{ id, article_id: form.article_id, quantite: form.quantite, notes: '' }],
  });
}

/** @deprecated — prefer deleteStockMovementBon */
export async function deleteStockMovement(id) {
  const { data, error } = await getSupabase().from(TABLE).select('ref_mouvement').eq('id', id).single();
  if (error) throw error;
  await deleteStockMovementBon(data.ref_mouvement);
}

export function movementStockDelta(type, qty) {
  return movementDelta(typeToDb(type), qty);
}
