/**
 * planningCommercial.js — Planning commercial CRUD (Supabase public.planning_commercial)
 */
import { getSupabase } from '../../lib/supabase';
import { prospectDisplayName } from './prospects';

const TABLE = 'planning_commercial';

export const PLANNING_STATUTS = ['planifie', 'confirme', 'realise', 'annule', 'reporte'];

export const PLANNING_STATUT_LABEL = {
  planifie: 'Planifie',
  confirme: 'Confirme',
  realise: 'Realise',
  annule: 'Annule',
  reporte: 'Reporte',
};

export const PLANNING_STATUT_BADGE = {
  planifie: 'badge-blue',
  confirme: 'badge-green',
  realise: 'badge-grey',
  annule: 'badge-red',
  reporte: 'badge-orange',
};

const PLANNING_SELECT = `
  *,
  prospects ( id, type, nom, prenom, prenom_interlocuteur, nom_interlocuteur )
`;

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function fmtTime(raw) {
  if (!raw) return '';
  const s = String(raw);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function weekStartMonday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEndSunday(weekStart) {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** DB row → shape PlanningCommercial.jsx */
export function normalizePlanning(row) {
  if (!row) return null;
  const p = row.prospects;
  return {
    id: row.id,
    rdv_type: row.rdv_type || 'prevu',
    titre: row.titre || '',
    type_rdv: row.type_rdv || '',
    date: fmtDate(row.date),
    heure: fmtTime(row.heure),
    lieu: row.lieu || '',
    prospect_id: row.prospect_id || '',
    prospect_nom: prospectDisplayName(p),
    type_projet: row.type_projet || '',
    secteur: row.secteur || '',
    societe: row.societe || '',
    statut: row.statut || 'planifie',
    priorite: row.priorite || 'normale',
    responsable: row.responsable || '',
    assigne_id: row.assigne_id || '',
    notes: row.notes || '',
    actions_suivantes: row.actions_suivantes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPlanningRow(form) {
  const isRapide = form.rdv_type === 'rapide';
  const titre = isRapide
    ? (form.titre?.trim() || (form.societe ? `Terrain - ${form.societe}` : 'Nouveau RDV terrain'))
    : (form.titre?.trim() || '');

  return {
    rdv_type: form.rdv_type || 'prevu',
    titre,
    type_rdv: isRapide ? null : (form.type_rdv || null),
    date: form.date,
    heure: form.heure || null,
    lieu: form.lieu?.trim() || null,
    prospect_id: isRapide ? null : (form.prospect_id || null),
    type_projet: form.type_projet || null,
    secteur: isRapide ? (form.secteur?.trim() || null) : null,
    societe: isRapide ? (form.societe?.trim() || null) : null,
    statut: form.statut || (isRapide ? 'planifie' : 'planifie'),
    priorite: form.priorite || 'normale',
    responsable: form.responsable?.trim() || null,
    assigne_id: form.assigne_id || null,
    notes: form.notes?.trim() || null,
    actions_suivantes: form.actions_suivantes?.trim() || null,
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

export async function listPlanningCommercial() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PLANNING_SELECT)
    .order('date', { ascending: false })
    .order('heure', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] planningCommercial list', error);
    throw error;
  }
  return (data || []).map(normalizePlanning);
}

export async function createPlanningCommercial(form) {
  await getAuthUserId();
  const row = toPlanningRow(form);

  if (!row.titre) {
    const err = new Error('Titre requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.date) {
    const err = new Error('Date requise.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(PLANNING_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] planningCommercial insert', error, row);
    throw error;
  }
  return normalizePlanning(data);
}

export async function updatePlanningCommercial(id, form) {
  await getAuthUserId();
  const row = toPlanningRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(PLANNING_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] planningCommercial update', error, { id, row });
    throw error;
  }
  return normalizePlanning(data);
}

export async function deletePlanningCommercial(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] planningCommercial delete', error, { id });
    throw error;
  }
}

export function isPlanningStale(rdv) {
  if (!rdv?.updated_at) return false;
  return (Date.now() - new Date(rdv.updated_at).getTime()) > 48 * 60 * 60 * 1000
    && rdv.statut === 'planifie';
}

export function filterPlanningRecords(records, filters = {}) {
  const {
    search = '',
    statut = '',
    rdvType = '',
    prospectId = '',
    date = '',
    commercial = '',
    typeRdv = '',
  } = filters;

  return (records || []).filter((r) => {
    const title = r.rdv_type === 'rapide'
      ? (r.societe ? `${r.societe}${r.secteur ? ` - ${r.secteur}` : ''}` : (r.titre || 'RDV terrain'))
      : (r.titre || '');
    const q = search.toLowerCase();
    if (search) {
      const match = title.toLowerCase().includes(q)
        || (r.prospect_nom || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (statut && r.statut !== statut) return false;
    if (rdvType && r.rdv_type !== rdvType) return false;
    if (prospectId && String(r.prospect_id) !== String(prospectId)) return false;
    if (date && r.date !== date) return false;
    if (commercial && r.responsable !== commercial) return false;
    if (typeRdv && r.type_rdv !== typeRdv) return false;
    return true;
  });
}

export function computePlanningStats(records, todayStr = new Date().toISOString().slice(0, 10)) {
  const list = records || [];
  const weekStart = weekStartMonday(todayStr);
  const weekEnd = weekEndSunday(weekStart);
  const inWeek = (d) => d >= weekStart && d <= weekEnd;

  return {
    total: list.length,
    aujourdhui: list.filter((r) => r.date === todayStr && r.statut !== 'annule').length,
    semaine: list.filter((r) => inWeek(r.date) && r.statut !== 'annule').length,
    enAttente: list.filter((r) => r.statut === 'planifie' || r.statut === 'confirme').length,
    termines: list.filter((r) => r.statut === 'realise').length,
    realises: list.filter((r) => r.statut === 'realise').length,
    terrain: list.filter((r) => r.rdv_type === 'rapide').length,
    stagnants: list.filter(isPlanningStale).length,
  };
}

export function collectPlanningCommercials(records) {
  const set = new Set();
  (records || []).forEach((r) => { if (r.responsable?.trim()) set.add(r.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
