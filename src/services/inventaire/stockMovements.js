/**
 * stockMovements.js — Bons de mouvement (Supabase stock_movements + stock_levels)
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
    created_at: row.created_at,
  };
}

function toMovementRow(form, uid) {
  const payload = {
    emplacement_source: (form.emplacement_source || '').trim(),
    emplacement_destination: (form.emplacement_destination || '').trim(),
    cree_par: (form.cree_par || '').trim(),
    livreur: (form.livreur || '').trim(),
    receptionnaire: (form.receptionnaire || '').trim(),
    note: (form.note || '').trim(),
    statut: form.statut || 'Brouillon',
    applied: !!form.applied,
  };
  return {
    ref_mouvement: (form.ref || '').trim() || null,
    type_mouvement: typeToDb(form.type_mouvement),
    article_id: form.article_id || null,
    warehouse_id: null,
    quantite: Number(form.quantite) || 0,
    date_mouvement: form.date_creation || new Date().toISOString().slice(0, 10),
    motif: (form.motif || '').trim() || null,
    payload,
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

function validateMovementForm(form) {
  const type = form.type_mouvement;
  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(type);
  const needsDest = ['Entrée', 'Transfert', 'Retour'].includes(type);
  if (!form.article_id) {
    const err = new Error('Sélectionnez un article.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!form.quantite || Number(form.quantite) <= 0) {
    const err = new Error('Quantité invalide.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (needsSource && !(form.emplacement_source || '').trim()) {
    const err = new Error('Emplacement source requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (needsDest && !(form.emplacement_destination || '').trim()) {
    const err = new Error('Emplacement destination requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (type === 'Transfert' && form.emplacement_source === form.emplacement_destination) {
    const err = new Error('Source et destination doivent être différentes.');
    err.code = 'VALIDATION';
    throw err;
  }
}

async function markApplied(id, payload) {
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ payload: { ...payload, applied: true } })
    .eq('id', id);
  if (error) throw error;
}

export async function createStockMovement(form) {
  const uid = await requireSupabaseUserId();
  validateMovementForm(form);

  const row = toMovementRow(form, uid);
  if (!row.ref_mouvement) row.ref_mouvement = await generateMovementRef();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*, stock_articles(reference, nom)')
    .single();
  if (error) throw error;

  const mvt = normalizeStockMovement(data);
  if (shouldApplyStock(mvt.statut) && !mvt.applied) {
    await applyMovementEffects(mvt);
    await markApplied(mvt.id, data.payload || row.payload);
    mvt.applied = true;
  }
  return mvt;
}

export async function updateStockMovement(id, form) {
  await requireSupabaseUserId();
  validateMovementForm(form);

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const prev = normalizeStockMovement(existing);
  const row = toMovementRow({ ...form, ref: form.ref || prev.ref, applied: prev.applied }, existing.created_by);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      type_mouvement: row.type_mouvement,
      article_id: row.article_id,
      quantite: row.quantite,
      date_mouvement: row.date_mouvement,
      motif: row.motif,
      payload: row.payload,
    })
    .eq('id', id)
    .select('*, stock_articles(reference, nom)')
    .single();
  if (error) throw error;

  const mvt = normalizeStockMovement(data);
  if (!prev.applied && shouldApplyStock(mvt.statut)) {
    await applyMovementEffects(mvt);
    await markApplied(mvt.id, data.payload || row.payload);
    mvt.applied = true;
  }
  return mvt;
}

export async function deleteStockMovement(id) {
  await requireSupabaseUserId();

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const prev = normalizeStockMovement(existing);
  if (prev.applied) {
    await applyMovementEffects(prev, true);
  }

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function movementStockDelta(type, qty) {
  return movementDelta(typeToDb(type), qty);
}
