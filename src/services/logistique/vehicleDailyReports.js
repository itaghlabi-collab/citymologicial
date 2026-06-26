/**
 * vehicleDailyReports.js — Comptes rendus journaliers / déplacements véhicule
 */
import { getSupabase } from '../../lib/supabase';
import { updateVehicle } from './vehicles';

const REPORTS = 'vehicle_daily_reports';
const TRIPS = 'vehicle_daily_trips';

const trimOrNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const OBJETS_MISSION = [
  'Chantier',
  'Livraison matériel',
  'Déplacement administratif',
  'Visite client',
  'Intervention SAV',
  'Autre',
];

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

async function getProfileName(userId) {
  const { data } = await getSupabase()
    .from('profiles')
    .select('prenom, nom, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return '';
  return [data.prenom, data.nom].filter(Boolean).join(' ').trim() || data.email || '';
}

export async function generateDailyReportRef() {
  const year = new Date().getFullYear();
  const prefix = `CRV-${year}-`;
  const { count, error } = await getSupabase()
    .from(REPORTS)
    .select('*', { count: 'exact', head: true })
    .like('ref', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
}

function normalizeTrip(row) {
  return {
    id: row.id,
    ordre: row.ordre,
    heure_depart: row.heure_depart ? String(row.heure_depart).slice(0, 5) : '',
    heure_arrivee: row.heure_arrivee ? String(row.heure_arrivee).slice(0, 5) : '',
    lieu_depart: row.lieu_depart || '',
    lieu_arrivee: row.lieu_arrivee || '',
    objet_mission: row.objet_mission || 'Chantier',
    projet_ref: row.projet_ref || '',
    projet_nom: row.projet_nom || '',
    km_parcourus: row.km_parcourus != null ? String(row.km_parcourus) : '',
    observations: row.observations || '',
  };
}

function normalizeReport(row, trips = []) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    vehicle_id: row.vehicle_id,
    matricule: row.matricule || '',
    vehicule_label: row.vehicule_label || '',
    chauffeur: row.chauffeur || '',
    date_rapport: row.date_rapport || '',
    km_depart: row.km_depart != null ? String(row.km_depart) : '',
    km_arrivee: row.km_arrivee != null ? String(row.km_arrivee) : '',
    km_parcourus: row.km_parcourus != null ? String(row.km_parcourus) : '',
    carburant_litres: row.carburant_litres != null ? String(row.carburant_litres) : '',
    observations: row.observations || '',
    statut: row.statut || 'valide',
    trips: trips.map(normalizeTrip),
  };
}

export async function getDailyReportForVehicleDate(vehicleId, dateRapport) {
  if (!vehicleId || !dateRapport) return null;
  const { data, error } = await getSupabase()
    .from(REPORTS)
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('date_rapport', dateRapport)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: trips, error: tErr } = await getSupabase()
    .from(TRIPS)
    .select('*')
    .eq('report_id', data.id)
    .order('ordre', { ascending: true });
  if (tErr) throw tErr;
  return normalizeReport(data, trips || []);
}

export async function listDailyReportsByVehicle(vehicleId, { limit = 30 } = {}) {
  if (!vehicleId) return [];
  const { data, error } = await getSupabase()
    .from(REPORTS)
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('date_rapport', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => normalizeReport(r, []));
}

export async function saveDailyReport(vehicle, form, trips = []) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  if (!vehicle?.id) throw new Error('Véhicule requis.');
  if (!form.date_rapport) throw new Error('Date du compte rendu requise.');

  const kmDepart = numOrNull(form.km_depart);
  const kmArrivee = numOrNull(form.km_arrivee);
  const tripsKm = (trips || []).reduce((s, t) => s + (numOrNull(t.km_parcourus) || 0), 0);
  const kmParcourus = kmDepart != null && kmArrivee != null
    ? Math.max(0, kmArrivee - kmDepart)
    : tripsKm || null;

  const existing = await getDailyReportForVehicleDate(vehicle.id, form.date_rapport);
  const ref = existing?.ref || await generateDailyReportRef();

  const payload = {
    ref,
    vehicle_id: vehicle.id,
    matricule: vehicle.matricule || '',
    vehicule_label: [vehicle.marque, vehicle.modele].filter(Boolean).join(' ') || vehicle.vehicule || '',
    chauffeur: trimOrNull(form.chauffeur) || trimOrNull(vehicle.chauffeur),
    date_rapport: form.date_rapport,
    km_depart: kmDepart,
    km_arrivee: kmArrivee,
    km_parcourus: kmParcourus,
    carburant_litres: numOrNull(form.carburant_litres),
    observations: trimOrNull(form.observations),
    statut: form.statut || 'valide',
    created_by: user.id,
    created_by_name: actorName,
    updated_at: new Date().toISOString(),
  };

  let reportId = existing?.id;
  if (reportId) {
    const { error } = await getSupabase().from(REPORTS).update(payload).eq('id', reportId);
    if (error) throw error;
    await getSupabase().from(TRIPS).delete().eq('report_id', reportId);
  } else {
    const { data, error } = await getSupabase().from(REPORTS).insert([payload]).select().single();
    if (error) throw error;
    reportId = data.id;
  }

  const tripRows = (trips || [])
    .filter((t) => t.lieu_depart || t.lieu_arrivee || t.objet_mission || t.km_parcourus)
    .map((t, idx) => ({
      report_id: reportId,
      ordre: idx + 1,
      heure_depart: trimOrNull(t.heure_depart) || null,
      heure_arrivee: trimOrNull(t.heure_arrivee) || null,
      lieu_depart: trimOrNull(t.lieu_depart),
      lieu_arrivee: trimOrNull(t.lieu_arrivee),
      objet_mission: trimOrNull(t.objet_mission) || 'Chantier',
      projet_ref: trimOrNull(t.projet_ref),
      projet_nom: trimOrNull(t.projet_nom),
      km_parcourus: numOrNull(t.km_parcourus),
      observations: trimOrNull(t.observations),
    }));

  if (tripRows.length) {
    const { error: insErr } = await getSupabase().from(TRIPS).insert(tripRows);
    if (insErr) throw insErr;
  }

  if (kmArrivee != null && kmArrivee > 0) {
    try {
      await updateVehicle(vehicle.id, { ...vehicle, km_actuel: String(kmArrivee) });
    } catch (err) {
      console.warn('[CITYMO] update vehicle km after report', err);
    }
  }

  return getDailyReportForVehicleDate(vehicle.id, form.date_rapport);
}
