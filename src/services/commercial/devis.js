/**
 * devis.js — Devis en attente CRUD (Supabase public.devis)
 */
import { getSupabase } from '../../lib/supabase';
import { prospectDisplayName } from './prospects';

const TABLE = 'devis';

export const DEVIS_STATUTS = ['en_attente', 'en_cours', 'realise', 'finalise', 'refuse'];

export const DEVIS_STATUT_LABEL = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  realise: 'Accepté',
  finalise: 'Finalisé',
  refuse: 'Refusé',
};

export const DEVIS_STATUT_BADGE = {
  en_attente: 'badge-orange',
  en_cours: 'badge-blue',
  realise: 'badge-green',
  finalise: 'badge-grey',
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
  const libre = String(row.prospect_nom || '').trim();
  return {
    id: row.id,
    numero: row.numero || '',
    titre: row.titre || '',
    prospect_id: row.prospect_id || '',
    prospect_nom: libre || prospectDisplayName(p),
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
  const prospectId = form.prospect_id || null;
  const prospectLibre = String(form.prospect_nom || '').trim();
  return {
    titre: String(form.titre || '').trim() || null,
    prospect_id: prospectId,
    // Nom libre uniquement si aucun prospect sélectionné
    prospect_nom: prospectId ? null : (prospectLibre || null),
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
  // MAX du suffixe (pas COUNT) — évite collision si DV-001 manquant / déjà DV-002
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('numero')
    .like('numero', 'DV-%')
    .order('numero', { ascending: false })
    .limit(100);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((row) => {
    const match = String(row.numero || '').match(/DV-(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  return `DV-${String(max + 1).padStart(3, '0')}`;
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

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    row.numero = await generateNumero();
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert([row])
      .select(DEVIS_SELECT)
      .single();

    if (!error) return normalizeDevis(data);

    lastError = error;
    // Collision unique sur numero → réessayer avec MAX+1
    if (error.code === '23505' && /numero|unique/i.test(`${error.message} ${error.details || ''}`)) {
      continue;
    }
    console.error('[CITYMO] devis insert', error, row);
    throw error;
  }

  console.error('[CITYMO] devis insert', lastError, row);
  throw lastError || new Error('Impossible de générer un numéro de devis unique.');
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
        || (r.numero || '').toLowerCase().includes(q)
        || (r.titre || '').toLowerCase().includes(q);
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
    finalises: list.filter((r) => r.statut === 'finalise').length,
    refuses: list.filter((r) => r.statut === 'refuse').length,
    stagnants: list.filter(isDevisStale).length,
  };
}
