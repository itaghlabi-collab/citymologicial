/**
 * devis.js — Devis en attente CRUD (Supabase public.devis)
 */
import { getSupabase } from '../../lib/supabase';
import { prospectDisplayName } from './prospects';

const TABLE = 'devis';

export const DEVIS_STATUTS = ['en_attente', 'en_cours', 'realise', 'refuse'];

export const DEVIS_STATUT_LABEL = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  realise: 'Accepte',
  refuse: 'Refuse',
};

export const DEVIS_STATUT_BADGE = {
  en_attente: 'badge-orange',
  en_cours: 'badge-blue',
  realise: 'badge-green',
  refuse: 'badge-red',
};

const DEVIS_SELECT = `
  *,
  prospects ( id, type, nom, prenom, prenom_interlocuteur, nom_interlocuteur )
`;

/** DB row → shape DevisAttente.jsx */
export function normalizeDevis(row) {
  if (!row) return null;
  const p = row.prospects;
  return {
    id: row.id,
    numero: row.numero || '',
    prospect_id: row.prospect_id || '',
    prospect_nom: prospectDisplayName(p),
    type_projet: row.type_projet || '',
    source: row.source || '',
    montant_estime: row.montant_estime != null ? Number(row.montant_estime) : null,
    statut: row.statut || 'en_attente',
    commentaire: row.commentaire || '',
    date_relance: row.date_relance || '',
    assigne_id: row.assigne_id || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toDevisRow(form) {
  return {
    prospect_id: form.prospect_id || null,
    type_projet: form.type_projet,
    source: form.source,
    montant_estime: form.montant_estime != null && form.montant_estime !== ''
      ? Number(form.montant_estime)
      : null,
    statut: form.statut || 'en_attente',
    commentaire: form.commentaire?.trim() || null,
    date_relance: form.date_relance || null,
    assigne_id: form.assigne_id || null,
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

async function generateNumero() {
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `DV-${String((count || 0) + 1).padStart(3, '0')}`;
}

export async function listDevis() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(DEVIS_SELECT)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] devis list', error);
    throw error;
  }
  return (data || []).map(normalizeDevis);
}

export async function createDevis(form) {
  await getAuthUserId();
  const row = toDevisRow(form);

  if (!row.type_projet) {
    const err = new Error('Type de projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.source) {
    const err = new Error('Source requise.');
    err.code = 'VALIDATION';
    throw err;
  }

  row.numero = await generateNumero();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(DEVIS_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] devis insert', error, row);
    throw error;
  }
  return normalizeDevis(data);
}

export async function updateDevis(id, form) {
  await getAuthUserId();
  const row = toDevisRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(DEVIS_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] devis update', error, { id, row });
    throw error;
  }
  return normalizeDevis(data);
}

export async function deleteDevis(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] devis delete', error, { id });
    throw error;
  }
}

export function isDevisStale(row) {
  if (!row?.updated_at) return false;
  const updated = new Date(row.updated_at);
  return (Date.now() - updated.getTime()) > 48 * 60 * 60 * 1000 && row.statut === 'en_attente';
}

export function filterDevisRecords(records, filters = {}) {
  const {
    search = '',
    statut = '',
    prospectId = '',
    date = '',
    montantMin = '',
    montantMax = '',
  } = filters;

  return (records || []).filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      const match = (r.prospect_nom || '').toLowerCase().includes(q)
        || (r.numero || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (statut && r.statut !== statut) return false;
    if (prospectId && String(r.prospect_id) !== String(prospectId)) return false;
    if (date) {
      const d = (r.date_relance || r.created_at || '').slice(0, 10);
      if (d !== date) return false;
    }
    if (montantMin !== '' && montantMin != null) {
      const min = Number(montantMin);
      if (!Number.isNaN(min) && (Number(r.montant_estime) || 0) < min) return false;
    }
    if (montantMax !== '' && montantMax != null) {
      const max = Number(montantMax);
      if (!Number.isNaN(max) && (Number(r.montant_estime) || 0) > max) return false;
    }
    return true;
  });
}

export function computeDevisStats(records) {
  const list = records || [];
  return {
    total: list.length,
    enAttente: list.filter((r) => r.statut === 'en_attente').length,
    enCours: list.filter((r) => r.statut === 'en_cours').length,
    acceptes: list.filter((r) => r.statut === 'realise').length,
    refuses: list.filter((r) => r.statut === 'refuse').length,
    stagnants: list.filter(isDevisStale).length,
  };
}
