/**
 * interventionHistory.js — Historique interventions clôturées (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { CLOSED_STATUTS } from './interventionRequests';

const TABLE = 'vehicle_intervention_history';

const trimOrNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Ligne historique → format tableau UI (compatible Demandes) */
export function fromHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: row.request_id,
    ref: row.ref,
    vehicule_id: row.vehicle_id || '',
    matricule: row.matricule || '',
    vehicule_label: row.vehicule_label || '',
    chauffeur: row.chauffeur || '',
    type_intervention: row.type_intervention || '',
    description: row.description || '',
    priorite: row.priorite || 'normale',
    date_demande: row.date_demande || '',
    date_intervention: row.date_intervention || '',
    date_fin: row.date_fin || '',
    statut: row.statut || 'termine',
    cout_estime: row.cout_final != null ? String(row.cout_final) : '',
    cout_final: row.cout_final != null ? String(row.cout_final) : '',
    garage: row.prestataire || '',
    prestataire: row.prestataire || '',
    notes: row.observation_finale || '',
    observation_finale: row.observation_finale || '',
  };
}

function requestToHistoryRow(req) {
  const today = todayIso();
  return {
    request_id: req.id,
    ref: req.ref,
    vehicle_id: req.vehicle_id || null,
    matricule: req.matricule,
    vehicule_label: req.vehicule_label,
    chauffeur: req.chauffeur,
    type_intervention: req.type_intervention,
    description: req.description,
    priorite: req.priorite,
    date_demande: req.date_demande,
    date_intervention: req.date_intervention || req.date_demande || today,
    date_fin: req.date_fin || today,
    cout_final: req.cout_final ?? req.cout_estime ?? null,
    prestataire: req.prestataire ?? req.garage ?? null,
    observation_finale: req.observation_finale ?? req.notes ?? null,
    statut: req.statut === 'annule' ? 'annule' : 'termine',
  };
}

/** Crée ou met à jour l'historique quand une demande est clôturée */
export async function syncHistoryFromRequest(requestRow) {
  const st = String(requestRow?.statut || '').toLowerCase();
  const closed = ['termine', 'terminée', 'terminee', 'annule', 'annulée', 'annulee'].includes(st)
    || CLOSED_STATUTS.includes(requestRow.statut);
  if (!requestRow?.id || !closed) return null;

  const payload = requestToHistoryRow(requestRow);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(payload, { onConflict: 'request_id' })
    .select()
    .single();

  if (error) throw error;
  return fromHistoryRow(data);
}

export async function removeHistoryByRequestId(requestId) {
  if (!requestId) return;
  const { error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq('request_id', requestId);
  if (error) throw error;
}

export async function listInterventionHistory() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_fin', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(fromHistoryRow);
}

export async function getInterventionHistory(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return fromHistoryRow(data);
}

export function filterInterventionHistory(list, filters = {}) {
  const {
    search = '',
    statut = '',
    priorite = '',
    matricule = '',
    chauffeur = '',
    typeIntervention = '',
    dateFrom = '',
    dateTo = '',
  } = filters;

  const q = search.toLowerCase().trim();

  return (list || []).filter((i) => {
    if (statut && i.statut !== statut) return false;
    if (priorite && i.priorite !== priorite) return false;
    if (matricule && i.matricule !== matricule) return false;
    if (chauffeur && (i.chauffeur || '') !== chauffeur) return false;
    if (typeIntervention && i.type_intervention !== typeIntervention) return false;
    const d = i.date_fin || i.date_demande;
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo && d && d > dateTo) return false;
    if (!q) return true;
    const blob = [i.ref, i.matricule, i.type_intervention, i.chauffeur, i.garage, i.prestataire]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
}
