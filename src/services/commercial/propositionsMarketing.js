/**
 * propositionsMarketing.js — Propositions CRUD (Supabase public.propositions_marketing)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'propositions_marketing';

export const PROPOSITION_STATUTS = ['brouillon', 'envoye', 'valide', 'refuse', 'en_revision'];

export const PROPOSITION_STATUT_LABEL = {
  brouillon: 'Brouillon',
  envoye: 'Envoye',
  valide: 'Valide',
  refuse: 'Refuse',
  en_revision: 'En revision',
};

export const PROPOSITION_STATUT_BADGE = {
  brouillon: 'badge-grey',
  envoye: 'badge-blue',
  valide: 'badge-green',
  refuse: 'badge-red',
  en_revision: 'badge-orange',
};

export const PROPOSITION_STATUT_NEXT = {
  brouillon: 'envoye',
  envoye: 'valide',
  en_revision: 'valide',
};

export const TYPE_PROPOSITION_VALUES = [
  'campagne_meta_ads',
  'campagne_google_ads',
  'shooting_photo_video',
  'creation_contenu',
  'gestion_reseaux_sociaux',
  'landing_page',
  'branding',
  'emailing',
  'offre_sponsorisee',
  'plan_marketing',
  'autre',
];

export const TYPE_PROPOSITION_LABEL = {
  campagne_meta_ads: 'Campagne Meta Ads',
  campagne_google_ads: 'Campagne Google Ads',
  shooting_photo_video: 'Shooting photo/vidéo',
  creation_contenu: 'Création contenu',
  gestion_reseaux_sociaux: 'Gestion réseaux sociaux',
  landing_page: 'Landing page',
  branding: 'Branding',
  emailing: 'Emailing',
  offre_sponsorisee: 'Offre sponsorisée',
  plan_marketing: 'Plan marketing',
  autre: 'Autre',
};

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function resolveTypeProposition(row) {
  if (row.type_proposition && TYPE_PROPOSITION_LABEL[row.type_proposition]) {
    return row.type_proposition;
  }
  if (row.type_proposition) return row.type_proposition;
  return '';
}

/** DB row → shape PropositionsMarketing.jsx */
export function normalizeProposition(row) {
  if (!row) return null;
  const typeProposition = resolveTypeProposition(row);
  return {
    id: row.id,
    titre: row.titre || '',
    marque_compte: row.marque_compte || '',
    type_proposition: typeProposition,
    objectif: row.objectif || '',
    description: row.description || '',
    budget_estime: row.budget_estime != null ? Number(row.budget_estime) : 0,
    statut: row.statut || 'brouillon',
    responsable: row.responsable || '',
    commentaire: row.commentaire || '',
    date_envoi: fmtDate(row.date_envoi),
    date_relance: fmtDate(row.date_relance),
    document_url: row.document_url || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row */
export function toPropositionRow(form) {
  const statut = form.statut || 'brouillon';
  const row = {
    titre: form.titre?.trim() || '',
    marque_compte: form.marque_compte?.trim() || null,
    type_proposition: form.type_proposition || null,
    type_projet: null,
    prospect_id: null,
    objectif: form.objectif?.trim() || null,
    description: form.description?.trim() || null,
    budget_estime: form.budget_estime != null && form.budget_estime !== ''
      ? Number(form.budget_estime) || 0
      : 0,
    statut,
    responsable: form.responsable?.trim() || null,
    commentaire: form.commentaire?.trim() || null,
    date_envoi: form.date_envoi || null,
    date_relance: form.date_relance || null,
    document_url: form.document_url?.trim() || null,
  };

  if (statut === 'envoye' && !row.date_envoi) {
    row.date_envoi = new Date().toISOString().slice(0, 10);
  }

  return row;
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

export async function listPropositions() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] propositionsMarketing list', error);
    throw error;
  }
  return (data || []).map(normalizeProposition);
}

export async function createProposition(form) {
  await getAuthUserId();
  const row = toPropositionRow(form);

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
    console.error('[CITYMO] propositionsMarketing insert', error, row);
    throw error;
  }
  return normalizeProposition(data);
}

export async function updateProposition(id, form) {
  await getAuthUserId();
  const row = toPropositionRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] propositionsMarketing update', error, { id, row });
    throw error;
  }
  return normalizeProposition(data);
}

export async function deleteProposition(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] propositionsMarketing delete', error, { id });
    throw error;
  }
}

export function filterPropositions(records, filters = {}) {
  const {
    search = '',
    statut = '',
    typeProposition = '',
    responsable = '',
    date = '',
  } = filters;

  return (records || []).filter((p) => {
    if (statut && p.statut !== statut) return false;
    if (typeProposition && p.type_proposition !== typeProposition) return false;
    if (responsable && p.responsable !== responsable) return false;
    if (date && fmtDate(p.created_at) !== date && p.date_envoi !== date && p.date_relance !== date) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${p.titre} ${p.marque_compte} ${p.objectif || ''} ${p.responsable || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computePropositionsStats(records) {
  const list = records || [];
  return {
    total: list.length,
    envoye: list.filter((p) => p.statut === 'envoye').length,
    valide: list.filter((p) => p.statut === 'valide').length,
    brouillon: list.filter((p) => p.statut === 'brouillon').length,
    refuse: list.filter((p) => p.statut === 'refuse').length,
    enAttente: list.filter((p) => ['brouillon', 'envoye', 'en_revision'].includes(p.statut)).length,
    acceptees: list.filter((p) => p.statut === 'valide').length,
    refusees: list.filter((p) => p.statut === 'refuse').length,
  };
}

export function collectPropositionsResponsables(records) {
  const set = new Set();
  (records || []).forEach((p) => { if (p.responsable?.trim()) set.add(p.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function typePropositionLabel(value) {
  return TYPE_PROPOSITION_LABEL[value] || value || '';
}
