/**
 * depenses.js — Dépenses commerciales / marketing CRUD (Supabase public.depenses)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'depenses';

export const DEPENSE_TYPES = ['marketing', 'commercial', 'evenement', 'deplacement', 'materiel', 'autre'];

export const DEPENSE_TYPE_LABEL = {
  marketing: 'Marketing',
  commercial: 'Commercial',
  evenement: 'Evenement',
  deplacement: 'Deplacement',
  materiel: 'Materiel',
  autre: 'Autre',
};

export const DEPENSE_TYPE_BADGE = {
  marketing: 'badge-blue',
  commercial: 'badge-green',
  evenement: 'badge-orange',
  deplacement: 'badge-grey',
  materiel: 'badge-red',
  autre: 'badge-grey',
};

export const DEPENSE_STATUTS = ['en_attente', 'valide', 'refuse'];

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

/** DB row → shape Depenses.jsx */
export function normalizeDepense(row) {
  if (!row) return null;
  return {
    id: row.id,
    intitule: row.intitule || '',
    titre: row.intitule || '',
    type: row.type || 'marketing',
    montant: row.montant != null ? Number(row.montant) : 0,
    date: fmtDate(row.date),
    reference: row.reference || '',
    commentaire: row.commentaire || '',
    fournisseur: row.fournisseur || '',
    projet_campagne: row.projet_campagne || '',
    responsable: row.responsable || '',
    mode_paiement: row.mode_paiement || '',
    justificatif_url: row.justificatif_url || '',
    statut_validation: row.statut_validation || 'en_attente',
    reference_id: row.reference_id || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row */
export function toDepenseRow(form) {
  return {
    intitule: form.intitule?.trim() || '',
    type: form.type || 'marketing',
    montant: form.montant != null && form.montant !== '' ? Number(form.montant) : 0,
    date: form.date,
    reference: form.reference?.trim() || null,
    commentaire: form.commentaire?.trim() || null,
    fournisseur: form.fournisseur?.trim() || null,
    projet_campagne: form.projet_campagne?.trim() || null,
    responsable: form.responsable?.trim() || null,
    mode_paiement: form.mode_paiement?.trim() || null,
    justificatif_url: form.justificatif_url?.trim() || null,
    statut_validation: form.statut_validation || 'en_attente',
    reference_id: form.reference_id || null,
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

export async function listDepenses() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] depenses list', error);
    throw error;
  }
  return (data || []).map(normalizeDepense);
}

export async function createDepense(form) {
  await getAuthUserId();
  const row = toDepenseRow(form);

  if (!row.intitule) {
    const err = new Error('Intitule requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.date) {
    const err = new Error('Date requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.montant || row.montant <= 0) {
    const err = new Error('Montant invalide.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] depenses insert', error, row);
    throw error;
  }
  return normalizeDepense(data);
}

export async function updateDepense(id, form) {
  await getAuthUserId();
  const row = toDepenseRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] depenses update', error, { id, row });
    throw error;
  }
  return normalizeDepense(data);
}

export async function deleteDepense(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] depenses delete', error, { id });
    throw error;
  }
}

export function filterDepenses(records, filters = {}) {
  const {
    search = '',
    type = '',
    dateFrom = '',
    dateTo = '',
    responsable = '',
    projet = '',
    statutValidation = '',
  } = filters;

  return (records || []).filter((d) => {
    if (type && d.type !== type) return false;
    if (dateFrom && d.date < dateFrom) return false;
    if (dateTo && d.date > dateTo) return false;
    if (responsable && d.responsable !== responsable) return false;
    if (projet && !(d.projet_campagne || '').toLowerCase().includes(projet.toLowerCase())) return false;
    if (statutValidation && d.statut_validation !== statutValidation) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${d.intitule} ${d.reference} ${d.commentaire || ''} ${d.fournisseur || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeDepensesStats(records, todayStr = new Date().toISOString().slice(0, 10)) {
  const list = records || [];
  const monthPrefix = todayStr.slice(0, 7);

  const sum = (arr) => arr.reduce((s, d) => s + (Number(d.montant) || 0), 0);

  const totalAll = sum(list);
  const totalMarketing = sum(list.filter((d) => d.type === 'marketing' || d.type === 'evenement'));
  const totalCommercial = sum(list.filter((d) => d.type === 'commercial' || d.type === 'deplacement'));
  const depensesMensuelles = sum(list.filter((d) => d.date?.startsWith(monthPrefix)));

  const parCategorie = DEPENSE_TYPES.reduce((acc, t) => {
    acc[t] = sum(list.filter((d) => d.type === t));
    return acc;
  }, {});

  return {
    totalAll,
    totalMarketing,
    totalCommercial,
    count: list.length,
    depensesMensuelles,
    parCategorie,
    validees: list.filter((d) => d.statut_validation === 'valide').length,
    enAttente: list.filter((d) => d.statut_validation === 'en_attente').length,
  };
}

export function sumDepensesMontant(records) {
  return (records || []).reduce((s, d) => s + (Number(d.montant) || 0), 0);
}

export function collectDepensesResponsables(records) {
  const set = new Set();
  (records || []).forEach((d) => { if (d.responsable?.trim()) set.add(d.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
