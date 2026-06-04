/**
 * actionsMarketing.js — Campagnes / actions marketing CRUD (Supabase public.actions_marketing)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'actions_marketing';

export const ACTION_TYPES = [
  'Publicite', 'SEA', 'SEO', 'Evenementiel', 'Email', 'Print', 'Reseaux sociaux', 'Autre',
];

export const ACTION_PRIORITES = ['haute', 'normale', 'basse'];

export const ACTION_CANAUX = ['meta', 'google', 'tiktok', 'offline', 'email', 'autre'];

export const ACTION_STATUTS = ['en_attente', 'en_cours', 'valide', 'termine', 'annule'];

export const ACTION_STATUT_LABEL = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  valide: 'Valide',
  termine: 'Termine',
  annule: 'Annule',
};

export const ACTION_STATUT_BADGE = {
  en_attente: 'badge-orange',
  en_cours: 'badge-blue',
  valide: 'badge-green',
  termine: 'badge-grey',
  annule: 'badge-red',
};

export const ACTION_PRIORITE_BADGE = {
  haute: 'badge-red',
  normale: 'badge-blue',
  basse: 'badge-grey',
};

export const ACTION_CANAL_LABEL = {
  meta: 'Meta/Facebook',
  google: 'Google Ads',
  tiktok: 'TikTok',
  offline: 'Hors-ligne',
  email: 'Email/Newsletter',
  autre: 'Autre',
};

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

/** DB row → shape ActionsMarketing.jsx */
export function normalizeActionMarketing(row) {
  if (!row) return null;
  return {
    id: row.id,
    titre: row.titre || '',
    type: row.type || 'Publicite',
    canal: row.canal || 'meta',
    budget: row.budget != null ? Number(row.budget) : 0,
    date_debut: fmtDate(row.date_debut),
    date_fin: fmtDate(row.date_fin),
    priorite: row.priorite || 'normale',
    statut: row.statut || 'en_attente',
    description: row.description || row.objectif || row.commentaire || '',
    objectif: row.objectif || '',
    responsable: row.responsable || '',
    leads_generes: row.leads_generes != null ? Number(row.leads_generes) : 0,
    commentaire: row.commentaire || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row */
export function toActionMarketingRow(form) {
  const description = form.description?.trim() || null;
  return {
    titre: form.titre?.trim() || '',
    type: form.type || 'Publicite',
    canal: form.canal || 'meta',
    budget: form.budget != null && form.budget !== '' ? Number(form.budget) : 0,
    date_debut: form.date_debut || null,
    date_fin: form.date_fin || null,
    priorite: form.priorite || 'normale',
    statut: form.statut || 'en_attente',
    description,
    objectif: form.objectif?.trim() || description,
    responsable: form.responsable?.trim() || null,
    leads_generes: form.leads_generes != null && form.leads_generes !== ''
      ? Number(form.leads_generes) || 0
      : 0,
    commentaire: form.commentaire?.trim() || description,
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

export async function listActionsMarketing() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] actionsMarketing list', error);
    throw error;
  }
  return (data || []).map(normalizeActionMarketing);
}

export async function createActionMarketing(form) {
  await getAuthUserId();
  const row = toActionMarketingRow(form);

  if (!row.titre) {
    const err = new Error('Titre requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] actionsMarketing insert', error, row);
    throw error;
  }
  return normalizeActionMarketing(data);
}

export async function updateActionMarketing(id, form) {
  await getAuthUserId();
  const row = toActionMarketingRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] actionsMarketing update', error, { id, row });
    throw error;
  }
  return normalizeActionMarketing(data);
}

export async function deleteActionMarketing(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] actionsMarketing delete', error, { id });
    throw error;
  }
}

export function filterActionsMarketing(records, filters = {}) {
  const {
    search = '',
    statut = '',
    type = '',
    canal = '',
    responsable = '',
    dateFrom = '',
    dateTo = '',
  } = filters;

  return (records || []).filter((a) => {
    if (statut && a.statut !== statut) return false;
    if (type && a.type !== type) return false;
    if (canal && a.canal !== canal) return false;
    if (responsable && a.responsable !== responsable) return false;
    if (dateFrom && a.date_debut && a.date_debut < dateFrom) return false;
    if (dateTo && a.date_debut && a.date_debut > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${a.titre} ${a.canal} ${a.responsable || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeActionsMarketingStats(records) {
  const list = records || [];
  const totalBudget = list.reduce((s, a) => s + (Number(a.budget) || 0), 0);
  const nbEnCours = list.filter((a) => a.statut === 'en_cours').length;
  const nbValide = list.filter((a) => a.statut === 'valide').length;
  const nbTermine = list.filter((a) => a.statut === 'termine').length;
  const leadsGeneres = list.reduce((s, a) => s + (Number(a.leads_generes) || 0), 0);

  return {
    total: list.length,
    enCours: nbEnCours,
    actives: nbEnCours,
    validesTermines: nbValide + nbTermine,
    totalBudget,
    leadsGeneres,
  };
}

export function collectActionsResponsables(records) {
  const set = new Set();
  (records || []).forEach((a) => { if (a.responsable?.trim()) set.add(a.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
