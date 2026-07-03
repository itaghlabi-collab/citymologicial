/**
 * projectExpenses.js — Dépenses par projet (Supabase public.project_expenses)
 */
import { getSupabase } from '../../lib/supabase';
import { isTotalSummaryRow } from './projectExpenseImportUtils';

const TABLE = 'project_expenses';

export const ORIGINE_LABELS = {
  import_excel: 'Import Excel initial',
  achat: 'Achat',
  ordre_paiement: 'Ordre de paiement',
  charge_manuelle: 'Charge manuelle',
};

export const ORIGINE_OPTIONS = Object.entries(ORIGINE_LABELS).map(([value, label]) => ({ value, label }));

export function normalizeProjectExpense(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id ? String(row.project_id) : '',
    project_name_raw: row.project_name_raw || '',
    project_match_status: row.project_match_status || 'matched',
    project_nom: row.projects?.nom || row.project_name_raw || '',
    date_depense: row.date_depense || '',
    categorie: row.categorie || '',
    element_depense: row.element_depense || '',
    description: row.description || '',
    fournisseur: row.fournisseur || '',
    montant: Number(row.montant) || 0,
    observation: row.observation || '',
    origine: row.origine || 'charge_manuelle',
    origine_label: ORIGINE_LABELS[row.origine] || row.origine,
    source_type: row.source_type || '',
    source_id: row.source_id ? String(row.source_id) : '',
    statut: row.statut || 'valide',
    payment_order_id: row.payment_order_id ? String(row.payment_order_id) : '',
    mode_paiement: row.mode_paiement || '',
    document_path: row.document_path || '',
    attachment_url: row.attachment_url || '',
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT = `
  *,
  projects ( id, nom, ref, responsable, budget_estime, statut )
`;

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

function toRow(form, userId) {
  return {
    project_id: form.project_id || null,
    project_name_raw: form.project_name_raw?.trim() || null,
    project_match_status: form.project_match_status || (form.project_id ? 'matched' : 'needs_manual'),
    date_depense: form.date_depense,
    categorie: form.categorie?.trim() || null,
    element_depense: (form.element_depense || form.element || '').trim(),
    description: form.description?.trim() || null,
    fournisseur: form.fournisseur?.trim() || null,
    montant: Number(form.montant) || 0,
    observation: form.observation?.trim() || null,
    origine: form.origine || 'charge_manuelle',
    source_type: form.source_type || null,
    source_id: form.source_id || null,
    statut: form.statut || 'valide',
    payment_order_id: form.payment_order_id || null,
    mode_paiement: form.mode_paiement?.trim() || null,
    document_path: form.document_path?.trim() || null,
    attachment_url: form.attachment_url?.trim() || null,
    created_by: userId,
  };
}

export async function listProjectExpenses(filters = {}) {
  await getAuthUserId();
  let q = getSupabase().from(TABLE).select(SELECT).order('date_depense', { ascending: false });
  if (filters.project_id) q = q.eq('project_id', filters.project_id);
  if (filters.origine) q = q.eq('origine', filters.origine);
  if (filters.statut) q = q.eq('statut', filters.statut);
  const { data, error } = await q;
  if (error) {
    console.error('[CITYMO] project_expenses list', error);
    throw error;
  }
  return (data || []).map(normalizeProjectExpense);
}

export async function createProjectExpense(form) {
  const userId = await getAuthUserId();
  const row = toRow(form, userId);
  const { data, error } = await getSupabase().from(TABLE).insert(row).select(SELECT).single();
  if (error) {
    console.error('[CITYMO] project_expenses insert', error);
    throw error;
  }
  return normalizeProjectExpense(data);
}

export async function updateProjectExpense(id, form) {
  await getAuthUserId();
  const row = toRow(form, form.created_by);
  delete row.created_by;
  const { data, error } = await getSupabase().from(TABLE).update(row).eq('id', id).select(SELECT).single();
  if (error) {
    console.error('[CITYMO] project_expenses update', error);
    throw error;
  }
  return normalizeProjectExpense(data);
}

export async function deleteProjectExpense(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function upsertProjectExpenseFromSource(payload) {
  await getAuthUserId();
  if (!payload.source_type || !payload.source_id) {
    throw new Error('source_type et source_id requis pour la synchronisation.');
  }
  const { data: existing } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('source_type', payload.source_type)
    .eq('source_id', payload.source_id)
    .maybeSingle();

  const row = {
    project_id: payload.project_id || null,
    project_name_raw: payload.project_name_raw || null,
    project_match_status: payload.project_id ? 'matched' : 'needs_manual',
    date_depense: payload.date_depense,
    categorie: payload.categorie || null,
    element_depense: payload.element_depense,
    description: payload.description || null,
    fournisseur: payload.fournisseur || null,
    montant: Number(payload.montant) || 0,
    observation: payload.observation || null,
    origine: payload.origine,
    source_type: payload.source_type,
    source_id: payload.source_id,
    statut: payload.statut || 'valide',
    payment_order_id: payload.payment_order_id || null,
    mode_paiement: payload.mode_paiement || null,
    document_path: payload.document_path || null,
  };

  if (existing?.id) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(row)
      .eq('id', existing.id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return { action: 'updated', row: normalizeProjectExpense(data) };
  }

  const { data, error } = await getSupabase().from(TABLE).insert(row).select(SELECT).single();
  if (error) throw error;
  return { action: 'created', row: normalizeProjectExpense(data) };
}

export async function bulkInsertProjectExpenses(rows) {
  await getAuthUserId();
  if (!rows.length) return [];
  const { data, error } = await getSupabase().from(TABLE).insert(rows).select(SELECT);
  if (error) throw error;
  return (data || []).map(normalizeProjectExpense);
}

export async function findImportDuplicate({ project_id, date_depense, element_depense, montant }) {
  const { data } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('origine', 'import_excel')
    .eq('project_id', project_id)
    .eq('date_depense', date_depense)
    .eq('element_depense', element_depense)
    .eq('montant', montant)
    .maybeSingle();
  return data?.id || null;
}

/** Supprime les lignes TOTAL importées par erreur (synthèse Excel, pas une dépense) */
export async function purgeImportedTotalSummaryRows() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, project_id, element_depense, categorie, description, fournisseur, montant')
    .eq('origine', 'import_excel');
  if (error) throw error;

  const rows = data || [];
  const ids = new Set();

  rows.forEach((row) => {
    if (isTotalSummaryRow({
      element: row.element_depense,
      description: row.description,
      categorie: row.categorie,
    })) {
      ids.add(row.id);
    }
  });

  // TOTAL en colonne DATE → importé comme "Dépense" avec montant = somme des autres lignes
  const byProject = {};
  rows.forEach((row) => {
    if (!row.project_id || ids.has(row.id)) return;
    if (!byProject[row.project_id]) byProject[row.project_id] = [];
    byProject[row.project_id].push(row);
  });

  Object.values(byProject).forEach((projectRows) => {
    projectRows.forEach((row) => {
      if (row.element_depense !== 'Dépense') return;
      if (row.description || row.fournisseur) return;
      const others = projectRows.filter((r) => r.id !== row.id && !ids.has(r.id));
      if (!others.length) return;
      const sumOthers = others.reduce((s, r) => s + (Number(r.montant) || 0), 0);
      if (Math.abs((Number(row.montant) || 0) - sumOthers) < 0.05) {
        ids.add(row.id);
      }
    });
  });

  if (!ids.size) return { deleted: 0 };

  const { error: delErr } = await getSupabase().from(TABLE).delete().in('id', [...ids]);
  if (delErr) throw delErr;
  return { deleted: ids.size };
}

export function filterProjectExpenses(rows, { search = '', origine = '', statut = '' } = {}) {
  const q = search.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (origine && r.origine !== origine) return false;
    if (statut && r.statut !== statut) return false;
    if (!q) return true;
    const hay = [r.element_depense, r.description, r.fournisseur, r.project_nom, r.categorie].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
