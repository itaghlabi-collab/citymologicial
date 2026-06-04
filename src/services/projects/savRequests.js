/**
 * savRequests.js — Demandes SAV liées aux projets
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from '../crm/clients';

const TABLE = 'sav_requests';

const SELECT = `
  *,
  projects ( id, ref, nom, client_nom, responsable ),
  clients ( id, nom, prenom )
`;

const STATUT_LABEL = {
  nouvelle: 'Nouvelle demande',
  en_attente: 'En attente',
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  cloturee: 'Clôturée',
};

export function normalizeSavRequest(row) {
  if (!row) return null;
  const p = row.projects;
  const c = row.clients;
  const clientNom = row.client_nom || clientDisplayName(c) || p?.client_nom || '';
  const projetNom = row.projet_nom || p?.nom || '';
  return {
    id: row.id,
    ref: row.ref || '',
    project_id: row.project_id ? String(row.project_id) : '',
    client_id: row.client_id ? String(row.client_id) : '',
    client: clientNom,
    client_nom: clientNom,
    projet_lie: projetNom,
    projet_nom: projetNom,
    ref_projet: row.ref_projet || p?.ref || '',
    titre: row.titre || '',
    type_sav: row.type_probleme || '',
    type_probleme: row.type_probleme || '',
    categorie: row.categorie || '',
    priorite: row.priorite || 'normale',
    statut: row.statut || 'nouvelle',
    statut_label: STATUT_LABEL[row.statut] || row.statut,
    date_demande: row.date_demande || '',
    responsable: row.responsable || '',
    technicien: row.responsable || '',
    contact_client: row.contact_client || '',
    localisation: row.localisation || '',
    departement: row.departement || '',
    date_intervention: row.date_intervention || '',
    description: row.description || '',
    observations: row.observations || '',
    actions_prevues: row.actions_prevues || '',
    project: p || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSavRow(form) {
  return {
    ref: form.ref?.trim() || '',
    project_id: form.project_id || null,
    client_id: form.client_id || null,
    client_nom: (form.client || form.client_nom || '').trim() || null,
    projet_nom: (form.projet_lie || form.projet_nom || '').trim() || null,
    ref_projet: form.ref_projet?.trim() || null,
    titre: (form.titre || form.type_sav || '').trim() || null,
    type_probleme: (form.type_probleme || form.type_sav || '').trim() || null,
    categorie: form.categorie?.trim() || null,
    priorite: form.priorite || 'normale',
    statut: form.statut || 'nouvelle',
    date_demande: form.date_demande || null,
    responsable: (form.responsable || form.technicien || '').trim() || null,
    contact_client: form.contact_client?.trim() || null,
    localisation: form.localisation?.trim() || null,
    departement: form.departement?.trim() || null,
    date_intervention: form.date_intervention || null,
    description: form.description?.trim() || null,
    observations: form.observations?.trim() || null,
    actions_prevues: form.actions_prevues?.trim() || null,
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

export async function generateSavRef() {
  await getAuthUserId();
  const y = new Date().getFullYear();
  const prefix = `SAV-${y}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(4, '0')}`;
}

export async function listSavRequests() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] sav_requests list', error);
    throw error;
  }
  return (data || []).map(normalizeSavRequest);
}

export async function listSavRequestsByProjectId(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('project_id', projectId)
    .order('date_demande', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeSavRequest);
}

export async function getSavRequestById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] sav_requests get', error);
    throw error;
  }
  return normalizeSavRequest(data);
}

export async function createSavRequest(form) {
  await getAuthUserId();
  const ref = form.ref?.trim() || await generateSavRef();
  const row = { ...toSavRow({ ...form, ref }), ref };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('id')
    .single();
  if (error) {
    console.error('[CITYMO] sav_requests insert', error);
    throw error;
  }
  return getSavRequestById(data.id);
}

export async function updateSavRequest(id, form) {
  await getAuthUserId();
  const row = toSavRow(form);
  if (form.ref?.trim()) row.ref = form.ref.trim();
  const { error } = await getSupabase().from(TABLE).update(row).eq('id', id);
  if (error) {
    console.error('[CITYMO] sav_requests update', error);
    throw error;
  }
  return getSavRequestById(id);
}

export async function deleteSavRequest(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function filterSavRequests(records, filters = {}) {
  const { search = '', statut = '', priorite = '', project_id = '' } = filters;
  return (records || []).filter((s) => {
    if (statut && s.statut !== statut) return false;
    if (priorite && s.priorite !== priorite) return false;
    if (project_id && String(s.project_id) !== String(project_id)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.ref} ${s.client} ${s.projet_lie} ${s.titre} ${s.type_sav}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
