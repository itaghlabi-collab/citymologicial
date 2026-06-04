/**
 * vehicles.js — CRUD flotte véhicules (Supabase).
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'vehicles';

const trimOrNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

/** Map formulaire UI → ligne DB */
export function toVehicleRow(form) {
  const num = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    vehicule: trimOrNull(form.vehicule) || trimOrNull([form.marque, form.modele].filter(Boolean).join(' ')),
    matricule_ww: trimOrNull(form.matricule_ww)?.toUpperCase() || null,
    matricule: trimOrNull(form.matricule)?.toUpperCase() || '',
    type: trimOrNull(form.type),
    marque: trimOrNull(form.marque),
    modele: trimOrNull(form.modele),
    annee: num(form.annee),
    couleur: trimOrNull(form.couleur),
    chauffeur: trimOrNull(form.chauffeur),
    departement: trimOrNull(form.departement),
    responsable: trimOrNull(form.responsable),
    statut: form.statut || 'disponible',
    assurance: trimOrNull(form.assurance),
    date_exp_assurance: trimOrNull(form.date_exp_assurance) || null,
    visite_technique: trimOrNull(form.visite_technique),
    date_exp_visite: trimOrNull(form.date_exp_visite) || null,
    carte_grise: trimOrNull(form.carte_grise),
    km_actuel: num(form.km_actuel),
    carburant: trimOrNull(form.carburant),
    consommation: num(form.consommation),
    observations: trimOrNull(form.observations),
  };
}

/** Map ligne DB → objet UI (Logistique.jsx) */
export function fromVehicleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicule: row.vehicule || '',
    matricule_ww: row.matricule_ww || '',
    matricule: row.matricule || '',
    type: row.type || '',
    marque: row.marque || '',
    modele: row.modele || '',
    annee: row.annee != null ? String(row.annee) : '',
    couleur: row.couleur || '',
    chauffeur: row.chauffeur || '',
    departement: row.departement || '',
    responsable: row.responsable || '',
    statut: row.statut || 'disponible',
    assurance: row.assurance || '',
    date_exp_assurance: row.date_exp_assurance || '',
    visite_technique: row.visite_technique || '',
    date_exp_visite: row.date_exp_visite || '',
    carte_grise: row.carte_grise || '',
    km_actuel: row.km_actuel != null ? String(row.km_actuel) : '',
    carburant: row.carburant || '',
    consommation: row.consommation != null ? String(row.consommation) : '',
    observations: row.observations || '',
  };
}

export async function listVehicles() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(fromVehicleRow);
}

export async function createVehicle(form) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([toVehicleRow(form)])
    .select()
    .single();

  if (error) throw error;
  return fromVehicleRow(data);
}

export async function updateVehicle(id, form) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toVehicleRow(form))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return fromVehicleRow(data);
}

export async function deleteVehicle(id) {
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function filterVehicles(vehicles, { search = '', statut = '', type = '' } = {}) {
  const q = search.toLowerCase().trim();
  return (vehicles || []).filter((v) => {
    if (statut && v.statut !== statut) return false;
    if (type && v.type !== type) return false;
    if (!q) return true;
    const blob = [
      v.matricule,
      v.matricule_ww,
      v.vehicule,
      v.marque,
      v.modele,
      v.chauffeur,
      v.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
}
