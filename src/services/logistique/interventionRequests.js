/**
 * interventionRequests.js — Demandes d'intervention véhicules (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { syncHistoryFromRequest, removeHistoryByRequestId } from './interventionHistory';

const TABLE = 'vehicle_intervention_requests';

/** Statuts clôturés (UI = termine ; alias SQL terminée accepté) */
export const CLOSED_STATUTS = ['termine', 'terminée', 'terminee', 'annule', 'annulée', 'annulee'];

export function normalizeInterventionStatut(statut) {
  const s = String(statut || '').trim().toLowerCase();
  if (s === 'terminée' || s === 'terminee') return 'termine';
  if (s === 'annulée' || s === 'annulee') return 'annule';
  return s;
}

const trimOrNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function vehicleLabel(v) {
  if (!v) return null;
  return trimOrNull(v.vehicule) || trimOrNull([v.marque, v.modele].filter(Boolean).join(' '));
}

/** UI formulaire → DB */
export function toRequestRow(form, vehicules = []) {
  const vehicle = vehicules.find((x) => x.id === form.vehicule_id);
  return {
    vehicle_id: trimOrNull(form.vehicule_id) || null,
    matricule: trimOrNull(form.matricule)?.toUpperCase() || trimOrNull(vehicle?.matricule)?.toUpperCase() || null,
    vehicule_label: vehicleLabel(vehicle),
    chauffeur: trimOrNull(form.chauffeur) || trimOrNull(vehicle?.chauffeur) || null,
    departement: trimOrNull(form.departement),
    type_intervention: trimOrNull(form.type_intervention) || 'Autre',
    description: trimOrNull(form.description),
    priorite: form.priorite || 'normale',
    date_demande: trimOrNull(form.date_demande) || null,
    date_prevue: trimOrNull(form.date_prevue) || null,
    statut: normalizeInterventionStatut(form.statut) || 'en_attente',
    cout_estime: numOrNull(form.cout_estime),
    garage: trimOrNull(form.garage),
    notes: trimOrNull(form.notes),
  };
}

/** DB → UI (Logistique.jsx) */
export function fromRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    vehicule_id: row.vehicle_id || '',
    matricule: row.matricule || '',
    vehicule_label: row.vehicule_label || '',
    chauffeur: row.chauffeur || '',
    departement: row.departement || '',
    type_intervention: row.type_intervention || '',
    description: row.description || '',
    priorite: row.priorite || 'normale',
    date_demande: row.date_demande || '',
    date_prevue: row.date_prevue || '',
    statut: normalizeInterventionStatut(row.statut) || 'en_attente',
    cout_estime: row.cout_estime != null ? String(row.cout_estime) : '',
    garage: row.garage || '',
    notes: row.notes || '',
  };
}

export async function nextInterventionRef() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.ref || '').match(/^INT-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });

  return `INT-${String(max + 1).padStart(3, '0')}`;
}

export async function listInterventionRequests() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(fromRequestRow);
}

export async function createInterventionRequest(form, vehicules = []) {
  const ref = await nextInterventionRef();
  const row = { ref, ...toRequestRow(form, vehicules) };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  const mapped = fromRequestRow(data);
  if (CLOSED_STATUTS.includes(normalizeInterventionStatut(mapped.statut))) {
    await syncHistoryFromRequest(data);
  }
  return mapped;
}

export async function updateInterventionRequest(id, form, vehicules = []) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toRequestRow(form, vehicules))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  if (CLOSED_STATUTS.includes(normalizeInterventionStatut(data.statut))) {
    await syncHistoryFromRequest(data);
  } else {
    await removeHistoryByRequestId(id);
  }

  return fromRequestRow(data);
}

export async function deleteInterventionRequest(id) {
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function filterInterventionRequests(list, filters = {}) {
  const {
    search = '',
    statut = '',
    priorite = '',
    matricule = '',
    chauffeur = '',
    dateFrom = '',
    dateTo = '',
  } = filters;

  const q = search.toLowerCase().trim();

  return (list || []).filter((i) => {
    if (statut && i.statut !== statut) return false;
    if (priorite && i.priorite !== priorite) return false;
    if (matricule && i.matricule !== matricule) return false;
    if (chauffeur && (i.chauffeur || '') !== chauffeur) return false;
    if (dateFrom && i.date_demande && i.date_demande < dateFrom) return false;
    if (dateTo && i.date_demande && i.date_demande > dateTo) return false;
    if (!q) return true;
    const blob = [i.ref, i.matricule, i.type_intervention, i.chauffeur, i.description, i.garage]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
}
