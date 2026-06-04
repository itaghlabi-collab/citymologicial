/**
 * comptesRendus.js — Comptes rendus commerciaux CRUD (Supabase public.comptes_rendus)
 */
import { getSupabase } from '../../lib/supabase';
import { prospectDisplayName } from './prospects';

const TABLE = 'comptes_rendus';

export const CR_STATUTS_SUIVI = ['en_attente', 'en_cours', 'cloture'];

export const CR_STATUT_SUIVI_LABEL = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  cloture: 'Cloture',
};

const CR_SELECT = `
  *,
  prospects ( id, type, nom, prenom, prenom_interlocuteur, nom_interlocuteur ),
  planning_commercial ( id, titre, date, rdv_type, societe, secteur )
`;

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function rdvDisplayTitle(r) {
  if (!r) return '';
  if (r.rdv_type === 'rapide') {
    return r.societe
      ? `${r.societe}${r.secteur ? ` - ${r.secteur}` : ''}`
      : (r.titre || 'RDV terrain');
  }
  return r.titre || '';
}

/** DB row → shape ComptesRendus.jsx */
export function normalizeCompteRendu(row) {
  if (!row) return null;
  const p = row.prospects;
  const rdv = row.planning_commercial;
  return {
    id: row.id,
    titre: row.titre || rdvDisplayTitle(rdv) || '',
    rdv_id: row.planning_rdv_id || '',
    planning_rdv_id: row.planning_rdv_id || '',
    prospect_id: row.prospect_id || '',
    prospect_nom: prospectDisplayName(p),
    rdv_titre: rdvDisplayTitle(rdv),
    rdv_date: fmtDate(rdv?.date),
    date: fmtDate(row.date),
    resume: row.resume || '',
    decision: row.decision || '',
    prochaine_action: row.prochaine_action || '',
    responsable: row.responsable || '',
    chantier_projet: row.chantier_projet || '',
    type_visite: row.type_visite || '',
    besoins_client: row.besoins_client || '',
    problemes_detectes: row.problemes_detectes || '',
    statut_suivi: row.statut_suivi || 'en_attente',
    documents_url: row.documents_url || '',
    assigne_id: row.assigne_id || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row */
export function toCompteRenduRow(form) {
  const hasAction = Boolean(form.prochaine_action?.trim());
  let statutSuivi = form.statut_suivi || 'en_attente';
  if (!form.statut_suivi) {
    if (!hasAction && form.decision?.trim()) statutSuivi = 'cloture';
    else if (hasAction) statutSuivi = 'en_cours';
  }

  return {
    titre: form.titre?.trim() || null,
    planning_rdv_id: form.rdv_id || form.planning_rdv_id || null,
    prospect_id: form.prospect_id || null,
    date: form.date || new Date().toISOString().slice(0, 10),
    resume: form.resume?.trim() || '',
    decision: form.decision?.trim() || null,
    prochaine_action: form.prochaine_action?.trim() || null,
    responsable: form.responsable?.trim() || null,
    chantier_projet: form.chantier_projet?.trim() || null,
    type_visite: form.type_visite?.trim() || null,
    besoins_client: form.besoins_client?.trim() || null,
    problemes_detectes: form.problemes_detectes?.trim() || null,
    statut_suivi: statutSuivi,
    documents_url: form.documents_url?.trim() || null,
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

export async function listComptesRendus() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(CR_SELECT)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] comptesRendus list', error);
    throw error;
  }
  return (data || []).map(normalizeCompteRendu);
}

export async function createCompteRendu(form) {
  await getAuthUserId();
  const row = toCompteRenduRow(form);

  if (!row.resume) {
    const err = new Error('Resume requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(CR_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] comptesRendus insert', error, row);
    throw error;
  }
  return normalizeCompteRendu(data);
}

export async function updateCompteRendu(id, form) {
  await getAuthUserId();
  const row = toCompteRenduRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(CR_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] comptesRendus update', error, { id, row });
    throw error;
  }
  return normalizeCompteRendu(data);
}

export async function deleteCompteRendu(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] comptesRendus delete', error, { id });
    throw error;
  }
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

export function filterComptesRendus(records, filters = {}) {
  const {
    search = '',
    responsable = '',
    prospectId = '',
    chantier = '',
    date = '',
    statutSuivi = '',
  } = filters;

  return (records || []).filter((cr) => {
    if (responsable && cr.responsable !== responsable) return false;
    if (prospectId && String(cr.prospect_id) !== String(prospectId)) return false;
    if (chantier && !(cr.chantier_projet || '').toLowerCase().includes(chantier.toLowerCase())) return false;
    if (date && cr.date !== date) return false;
    if (statutSuivi && cr.statut_suivi !== statutSuivi) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${cr.resume} ${cr.prospect_nom} ${cr.rdv_titre} ${cr.titre} ${cr.decision || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeComptesRendusStats(records, todayStr = new Date().toISOString().slice(0, 10)) {
  const list = records || [];
  const monthPrefix = todayStr.slice(0, 7);
  const weekStart = weekStartMonday(todayStr);
  const weekEnd = weekEndSunday(weekStart);
  const inWeek = (d) => d >= weekStart && d <= weekEnd;

  return {
    total: list.length,
    ceMois: list.filter((c) => c.date?.startsWith(monthPrefix)).length,
    avecActionSuivante: list.filter((c) => c.prochaine_action?.trim()).length,
    visitesSemaine: list.filter((c) => inWeek(c.date)).length,
    suivisEnAttente: list.filter((c) => c.statut_suivi === 'en_attente').length,
    visitesCloturees: list.filter((c) => c.statut_suivi === 'cloture').length,
  };
}

export function collectComptesResponsables(records) {
  const set = new Set();
  (records || []).forEach((c) => { if (c.responsable?.trim()) set.add(c.responsable.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
