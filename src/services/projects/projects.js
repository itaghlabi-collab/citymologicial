/**
 * projects.js — Module Projets ERP (Supabase public.projects)
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from '../crm/clients';

const TABLE = 'projects';

const SELECT = `
  *,
  clients ( id, nom, prenom, email, telephone, ville, adresse )
`;

export function normalizeProject(row) {
  if (!row) return null;
  const c = row.clients;
  const clientNom = row.client_nom || clientDisplayName(c) || '';
  return {
    id: row.id,
    ref: row.ref || '',
    nom: row.nom || '',
    client_id: row.client_id ? String(row.client_id) : '',
    client: clientNom,
    client_nom: clientNom,
    type_projet: row.type_projet || '',
    adresse_chantier: row.adresse_chantier || '',
    ville: row.ville || '',
    date_debut: row.date_debut || '',
    date_fin_prevue: row.date_fin_prevue || '',
    statut: row.statut || 'brouillon',
    responsable: row.responsable || '',
    chef_projet: row.responsable || '',
    chef_chantier: row.chef_chantier || '',
    budget_approuve: Number(row.budget_estime ?? 0),
    budget_estime: Number(row.budget_estime ?? 0),
    budget_consomme: Number(row.budget_consomme ?? 0),
    description: row.description || '',
    observations: row.observations || '',
    devis_id: row.devis_id ? String(row.devis_id) : '',
    devis_lie: row.devis_reference || '',
    devis_reference: row.devis_reference || '',
    facture_id: row.facture_id ? String(row.facture_id) : '',
    facture_reference: row.facture_reference || '',
    priorite: row.priorite || 'normale',
    avancement: Number(row.avancement ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toProjectRow(form) {
  const statut = form.statut || 'brouillon';
  const allowed = ['brouillon', 'en_cours', 'en_pause', 'termine', 'annule'];
  return {
    ref: form.ref?.trim() || '',
    nom: form.nom?.trim() || '',
    client_id: form.client_id || null,
    client_nom: form.client_nom?.trim() || form.client?.trim() || null,
    type_projet: form.type_projet?.trim() || null,
    adresse_chantier: form.adresse_chantier?.trim() || null,
    ville: form.ville?.trim() || null,
    date_debut: form.date_debut || null,
    date_fin_prevue: form.date_fin_prevue || null,
    statut: allowed.includes(statut) ? statut : 'brouillon',
    responsable: (form.responsable || form.chef_projet || '').trim() || null,
    chef_chantier: form.chef_chantier?.trim() || null,
    budget_estime: Number(form.budget_approuve ?? form.budget_estime) || 0,
    budget_consomme: Number(form.budget_consomme) || 0,
    description: form.description?.trim() || null,
    observations: form.observations?.trim() || null,
    devis_id: form.devis_id || null,
    devis_reference: (form.devis_lie || form.devis_reference || '').trim() || null,
    facture_id: form.facture_id || null,
    facture_reference: form.facture_reference?.trim() || null,
    priorite: form.priorite || 'normale',
    avancement: Math.min(100, Math.max(0, Number(form.avancement) || 0)),
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

export async function generateProjectRef() {
  await getAuthUserId();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PRJ-${y}${m}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

export async function listProjects() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] projects list', error);
    throw error;
  }
  return (data || []).map(normalizeProject);
}

export async function getProjectById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] projects get', error, { id });
    throw error;
  }
  return normalizeProject(data);
}

export async function createProject(form) {
  await getAuthUserId();
  const ref = form.ref?.trim() || await generateProjectRef();
  const row = { ...toProjectRow({ ...form, ref }), ref };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] projects insert', error, row);
    throw error;
  }
  return getProjectById(data.id);
}

export async function updateProject(id, form) {
  await getAuthUserId();
  const row = toProjectRow(form);
  if (form.ref?.trim()) row.ref = form.ref.trim();

  const { error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] projects update', error, { id, row });
    throw error;
  }
  return getProjectById(id);
}

export async function deleteProject(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] projects delete', error, { id });
    throw error;
  }
}

export function isProjectLate(p) {
  if (!p?.date_fin_prevue) return false;
  if (['termine', 'annule'].includes(p.statut)) return false;
  return new Date(p.date_fin_prevue) < new Date();
}

export function filterProjects(records, filters = {}) {
  const {
    search = '',
    statut = '',
    client_id = '',
    type_projet = '',
    date = '',
  } = filters;

  return (records || []).filter((p) => {
    if (statut && p.statut !== statut) return false;
    if (client_id && String(p.client_id) !== String(client_id)) return false;
    if (type_projet && p.type_projet !== type_projet) return false;
    if (date && p.date_debut !== date) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${p.ref || ''} ${p.nom || ''} ${p.client || ''} ${p.responsable || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeProjectStats(records) {
  const list = records || [];
  return {
    total: list.length,
    enCours: list.filter((p) => p.statut === 'en_cours').length,
    termines: list.filter((p) => p.statut === 'termine').length,
    enRetard: list.filter((p) => isProjectLate(p)).length,
    budgetTotal: list.reduce((s, p) => s + (p.budget_approuve || 0), 0),
    budgetConso: list.reduce((s, p) => s + (p.budget_consomme || 0), 0),
  };
}
