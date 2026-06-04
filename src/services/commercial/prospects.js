/**
 * prospects.js — CRUD Prospects (Supabase public.prospects)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'prospects';

export const STATUT_VALUES = ['nouveau', 'en_cours', 'converti', 'perdu'];

export const STATUT_LABEL = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  converti: 'Converti',
  perdu: 'Perdu',
};

export function prospectDisplayName(p) {
  if (!p) return '';
  if (p.type === 'btob') {
    return p.nom?.trim()
      || [p.prenom_interlocuteur, p.nom_interlocuteur].filter(Boolean).join(' ').trim()
      || '';
  }
  return [p.prenom, p.nom].filter(Boolean).join(' ').trim();
}

/** DB row → shape Prospects.jsx */
export function normalizeProspect(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    nom: row.nom || '',
    prenom: row.prenom || '',
    prenom_interlocuteur: row.prenom_interlocuteur || '',
    nom_interlocuteur: row.nom_interlocuteur || '',
    email: row.email || '',
    telephone: row.telephone || '',
    fonction: row.fonction || '',
    secteur: row.secteur || '',
    niveau_decisionnel: row.niveau_decisionnel || '',
    type_projet: row.type_projet || '',
    source: row.source || '',
    action: row.action || '',
    commentaire: row.commentaire || '',
    statut: row.statut || 'nouveau',
    budget: row.budget != null ? Number(row.budget) : null,
    ville: row.ville || '',
    date_contact: row.date_contact || '',
    prochain_suivi: row.prochain_suivi || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deriveBtobNom(form) {
  return form.nom?.trim()
    || form.secteur?.trim()
    || form.nom_interlocuteur?.trim()
    || 'Entreprise';
}

/** Form UI → DB row */
export function toProspectRow(form) {
  const isBtob = form.type === 'btob';
  const row = {
    type: form.type,
    nom: isBtob ? deriveBtobNom(form) : (form.nom?.trim() || ''),
    prenom: isBtob ? null : (form.prenom?.trim() || null),
    prenom_interlocuteur: isBtob ? (form.prenom_interlocuteur?.trim() || null) : null,
    nom_interlocuteur: isBtob ? (form.nom_interlocuteur?.trim() || null) : null,
    email: form.email?.trim() || null,
    telephone: form.telephone?.trim() || null,
    fonction: isBtob ? (form.fonction?.trim() || null) : null,
    secteur: isBtob ? (form.secteur?.trim() || null) : null,
    niveau_decisionnel: isBtob ? (form.niveau_decisionnel?.trim() || null) : null,
    type_projet: form.type_projet,
    source: form.source?.trim() || null,
    action: form.action?.trim() || null,
    commentaire: form.commentaire?.trim() || null,
    statut: form.statut || 'nouveau',
    budget: form.budget != null && form.budget !== '' ? Number(form.budget) : null,
    ville: form.ville?.trim() || null,
    date_contact: form.date_contact || null,
    prochain_suivi: form.prochain_suivi || null,
  };
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

export async function listProspects() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] prospects list', error);
    throw error;
  }
  return (data || []).map(normalizeProspect);
}

export async function createProspect(form) {
  await getAuthUserId();
  const row = toProspectRow(form);

  if (!row.type) {
    const err = new Error('Type requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.nom) {
    const err = new Error('Nom requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.type_projet) {
    const err = new Error('Type de projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] prospects insert', error, row);
    throw error;
  }
  return normalizeProspect(data);
}

export async function updateProspect(id, form) {
  await getAuthUserId();
  const row = toProspectRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] prospects update', error, { id, row });
    throw error;
  }
  return normalizeProspect(data);
}

export async function deleteProspect(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] prospects delete', error, { id });
    throw error;
  }
}

export function filterProspects(records, filters = {}) {
  const {
    search = '',
    type = '',
    statut = '',
    source = '',
    ville = '',
    typeProjet = '',
    date = '',
  } = filters;

  return (records || []).filter((r) => {
    const displayName = r.type === 'btob'
      ? (r.nom || r.nom_interlocuteur || '')
      : `${r.prenom || ''} ${r.nom || ''}`.trim();
    const q = search.toLowerCase();
    if (search) {
      const match = displayName.toLowerCase().includes(q)
        || (r.telephone || '').includes(search)
        || (r.email || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (type && r.type !== type) return false;
    if (statut && r.statut !== statut) return false;
    if (source && r.source !== source) return false;
    if (ville && r.ville !== ville) return false;
    if (typeProjet && r.type_projet !== typeProjet) return false;
    if (date) {
      const d = (r.date_contact || r.created_at || '').slice(0, 10);
      if (d !== date) return false;
    }
    return true;
  });
}

export function computeProspectStats(records) {
  const list = records || [];
  return {
    total: list.length,
    nouveaux: list.filter((r) => r.statut === 'nouveau').length,
    enCours: list.filter((r) => r.statut === 'en_cours').length,
    convertis: list.filter((r) => r.statut === 'converti').length,
    nbParticulier: list.filter((r) => r.type === 'particulier').length,
    nbBtob: list.filter((r) => r.type === 'btob').length,
  };
}

export function collectProspectVilles(records) {
  const set = new Set();
  (records || []).forEach((r) => { if (r.ville?.trim()) set.add(r.ville.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
