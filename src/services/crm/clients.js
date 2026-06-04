/**
 * clients.js — CRM Clients CRUD (Supabase public.clients)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'clients';

export const CLIENT_STATUTS = ['actif', 'en_attente', 'important', 'archive'];

export const CLIENT_STATUT_LABEL = {
  actif: 'Actif',
  en_attente: 'En attente',
  important: 'Important',
  archive: 'Archive',
};

export const CLIENT_STATUT_BADGE = {
  actif: 'badge-green',
  en_attente: 'badge-orange',
  important: 'badge-red',
  archive: 'badge-grey',
};

/** DB row → shape Clients.jsx */
export function normalizeClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom || '',
    prenom: row.prenom || '',
    email: row.email || '',
    telephone: row.telephone || '',
    ice: row.ice || '',
    responsable: row.responsable || '',
    adresse: row.adresse || '',
    ville: row.ville || '',
    secteur: row.secteur || '',
    statut: row.statut || 'actif',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function clientDisplayName(c) {
  if (!c) return '';
  return [c.prenom, c.nom].filter(Boolean).join(' ').trim() || c.nom || '';
}

/** Form UI → DB row */
export function toClientRow(form) {
  return {
    nom: form.nom?.trim() || '',
    prenom: form.prenom?.trim() || null,
    email: form.email?.trim() || null,
    telephone: form.telephone?.trim() || null,
    ice: form.ice?.trim() || null,
    responsable: form.responsable?.trim() || null,
    adresse: form.adresse?.trim() || null,
    ville: form.ville?.trim() || null,
    secteur: form.secteur?.trim() || null,
    statut: form.statut || 'actif',
    notes: form.notes?.trim() || null,
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

export async function listClients() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });

  if (error) {
    console.error('[CITYMO] clients list', error);
    throw error;
  }
  return (data || []).map(normalizeClient);
}

export async function createClient(form) {
  await getAuthUserId();
  const row = toClientRow(form);

  if (!row.nom) {
    const err = new Error('Nom requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] clients insert', error, row);
    throw error;
  }
  return normalizeClient(data);
}

export async function updateClient(id, form) {
  await getAuthUserId();
  const row = toClientRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[CITYMO] clients update', error, { id, row });
    throw error;
  }
  return normalizeClient(data);
}

export async function deleteClient(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] clients delete', error, { id });
    throw error;
  }
}

export function filterClients(records, filters = {}) {
  const {
    search = '',
    statut = '',
    responsable = '',
  } = filters;

  return (records || []).filter((c) => {
    if (statut && c.statut !== statut) return false;
    if (responsable && c.responsable !== responsable) return false;
    if (search) {
      const q = search.toLowerCase();
      const nom = clientDisplayName(c).toLowerCase();
      const hay = `${nom} ${c.telephone || ''} ${c.email || ''} ${c.ice || ''} ${c.responsable || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeClientsStats(records) {
  const list = records || [];
  return {
    total: list.length,
    actifs: list.filter((c) => c.statut === 'actif').length,
    enAttente: list.filter((c) => c.statut === 'en_attente').length,
    importants: list.filter((c) => c.statut === 'important').length,
  };
}

export function collectClientsResponsables(records) {
  const set = new Set();
  (records || []).forEach((c) => { if (c.responsable?.trim()) set.add(c.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
