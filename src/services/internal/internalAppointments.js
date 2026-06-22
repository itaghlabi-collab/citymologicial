/**
 * internalAppointments.js — CRUD Rendez-vous organisation interne (Supabase internal_appointments)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'internal_appointments';

export const RDV_TYPES = ['appel', 'visite_client', 'reunion_interne', 'chantier', 'commercial', 'autre'];
export const RDV_STATUTS = ['planifie', 'termine', 'annule', 'reporte'];

export const RDV_TYPE_LABELS = {
  appel: 'Appel',
  visite_client: 'Visite client',
  reunion_interne: 'Reunion interne',
  chantier: 'Chantier',
  commercial: 'Commercial',
  autre: 'Autre',
};

export const RDV_STATUT_LABELS = {
  planifie: 'Planifie',
  termine: 'Termine',
  annule: 'Annule',
  reporte: 'Reporte',
};

function fmtTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

export function normalizeInternalAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    titre: row.titre || '',
    client_prospect: row.client_prospect || '',
    employe: row.responsable || '',
    responsable: row.responsable || '',
    date: row.date_rdv || '',
    heure: fmtTime(row.heure_debut),
    heure_debut: fmtTime(row.heure_debut),
    heure_fin: fmtTime(row.heure_fin),
    lieu: row.lieu || '',
    type: row.type_rdv || 'reunion_interne',
    statut: row.statut || 'planifie',
    description: row.commentaire || '',
    commentaire: row.commentaire || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toInternalAppointmentRow(form) {
  return {
    titre: form.titre?.trim() || '',
    client_prospect: (form.client_prospect || '').trim() || null,
    responsable: (form.employe || form.responsable || '').trim() || null,
    date_rdv: form.date || form.date_rdv,
    heure_debut: form.heure || form.heure_debut || '09:00',
    heure_fin: form.heure_fin || null,
    lieu: form.lieu?.trim() || null,
    type_rdv: form.type || 'reunion_interne',
    statut: form.statut || 'planifie',
    commentaire: (form.description || form.commentaire || '').trim() || null,
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

export async function listInternalAppointments() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_rdv', { ascending: true })
    .order('heure_debut', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeInternalAppointment);
}

export async function createInternalAppointment(form) {
  await getAuthUserId();
  const row = toInternalAppointmentRow(form);
  if (!row.titre || !row.date_rdv) {
    const err = new Error('Titre et date requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalAppointment(data);
}

export async function updateInternalAppointment(id, form) {
  await getAuthUserId();
  const row = toInternalAppointmentRow(form);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalAppointment(data);
}

export async function deleteInternalAppointment(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function setInternalAppointmentStatut(id, statut) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalAppointment(data);
}

export function filterInternalAppointments(appts, filters = {}) {
  let rows = [...(appts || [])];
  const { date, responsable, statut, type, mine } = filters;

  if (date) rows = rows.filter((a) => a.date === date);
  if (responsable && responsable !== 'all') {
    rows = rows.filter((a) => a.employe === responsable);
  }
  if (statut && statut !== 'all') {
    rows = rows.filter((a) => a.statut === statut);
  }
  if (type && type !== 'all') {
    rows = rows.filter((a) => a.type === type);
  }
  if (mine) {
    rows = rows.filter((a) => !!a.employe);
  }
  return rows;
}

export function collectAppointmentResponsables(appts) {
  return [...new Set((appts || []).map((a) => a.employe).filter(Boolean))].sort();
}

/** Shape for Dashboard timeline */
export function toDashboardMeeting(appt, today) {
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const isOverdue = Boolean(
    appt.date && appt.date < todayIso && appt.statut === 'planifie',
  );
  const isToday = appt.date === todayIso;

  const typeMap = {
    appel: 'call',
    visite_client: 'call',
    reunion_interne: 'other',
    chantier: 'other',
    commercial: 'call',
    autre: 'other',
  };

  const lieu = appt.lieu || appt.client_prospect || '—';
  const resp = appt.employe || '';

  return {
    id: appt.id,
    date: appt.date,
    time: appt.heure || '—',
    title: appt.titre,
    location: isOverdue
      ? `Relance · ${lieu}${resp ? ` · ${resp}` : ''}`
      : `${lieu}${resp ? ` · ${resp}` : ''}`,
    type: isOverdue ? 'overdue' : (isToday ? (typeMap[appt.type] || 'other') : 'other'),
    tech: isOverdue ? `Prévu le ${appt.date}` : '',
    statut: appt.statut,
    isOverdue,
    isToday,
  };
}
