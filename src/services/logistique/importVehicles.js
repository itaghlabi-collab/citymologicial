/**
 * importVehicles.js — Import seed flotte (sans doublons matricule / matricule_ww).
 */
import { getSupabase } from '../../lib/supabase';
import { VEHICLE_IMPORT_SEED } from '../../data/vehicleImportSeed';
import { listVehicles, fromVehicleRow, toVehicleRow } from './vehicles';

const TABLE = 'vehicles';

function isEmpty(v) {
  return v == null || !String(v).trim();
}

function parseVehiculeLabel(label) {
  const s = String(label || '').trim();
  if (!s) return { marque: null, modele: null, vehicule: null };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { marque: parts[0], modele: null, vehicule: s };
  return { marque: parts[0], modele: parts.slice(1).join(' '), vehicule: s };
}

function inferTypeFromLabel(label) {
  const u = String(label || '').toUpperCase();
  if (u.includes('MOTO')) return 'Scooter';
  if (u.includes('EXPRESS') || u.includes('TRAFIC')) return 'Fourgon';
  return null;
}

function buildIndex(existing) {
  const byMatricule = new Map();
  const byMatriculeWw = new Map();
  (existing || []).forEach((v) => {
    const m = String(v.matricule || '').trim().toUpperCase();
    if (m) byMatricule.set(m, v);
    const w = String(v.matricule_ww || '').trim().toUpperCase();
    if (w) byMatriculeWw.set(w, v);
  });
  return { byMatricule, byMatriculeWw };
}

function seedToForm(seed) {
  const { marque, modele, vehicule } = parseVehiculeLabel(seed.vehicule);
  const chauffeur = isEmpty(seed.chauffeur) ? null : String(seed.chauffeur).trim();
  return {
    vehicule,
    matricule_ww: isEmpty(seed.matricule_ww) ? '' : String(seed.matricule_ww).trim(),
    matricule: String(seed.matricule || '').trim(),
    type: inferTypeFromLabel(seed.vehicule) || '',
    marque: marque || '',
    modele: modele || '',
    chauffeur: chauffeur || '',
    statut: chauffeur ? 'affecte' : 'disponible',
    observations: null,
    annee: '',
    couleur: '',
    departement: '',
    responsable: '',
    assurance: '',
    date_exp_assurance: '',
    visite_technique: '',
    date_exp_visite: '',
    carte_grise: '',
    km_actuel: '',
    carburant: '',
    consommation: '',
  };
}

/**
 * @returns {Promise<{ imported: number, updated: number, skipped: number, errors: string[] }>}
 */
export async function importVehiclesFromSeed(seedRows = VEHICLE_IMPORT_SEED) {
  const existing = await listVehicles();
  const index = buildIndex(existing);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const supabase = getSupabase();

  for (const seed of seedRows) {
    const form = seedToForm(seed);
    const mat = form.matricule.toUpperCase();
    const ww = form.matricule_ww ? form.matricule_ww.toUpperCase() : '';

    if (!mat) {
      skipped += 1;
      errors.push(`${seed.vehicule}: matricule manquant`);
      continue;
    }

    const existingByMat = index.byMatricule.get(mat);
    const existingByWw = ww ? index.byMatriculeWw.get(ww) : null;
    const existingRow = existingByMat || existingByWw;

    try {
      const row = toVehicleRow(form);

      if (existingRow) {
        const { data, error } = await supabase
          .from(TABLE)
          .update(row)
          .eq('id', existingRow.id)
          .select()
          .single();
        if (error) throw error;
        const mapped = fromVehicleRow(data);
        index.byMatricule.set(mat, mapped);
        if (ww) index.byMatriculeWw.set(ww, mapped);
        updated += 1;
        continue;
      }

      const { data, error } = await supabase
        .from(TABLE)
        .insert([row])
        .select()
        .single();
      if (error) throw error;
      const mapped = fromVehicleRow(data);
      index.byMatricule.set(mat, mapped);
      if (ww) index.byMatriculeWw.set(ww, mapped);
      imported += 1;
    } catch (err) {
      errors.push(`${seed.vehicule} (${mat}): ${err?.message || String(err)}`);
      if (/column|schema cache/i.test(err?.message || '')) {
        errors.push('Exécutez supabase/migrations/20260527150000_logistique_vehicles.sql');
        break;
      }
    }
  }

  return { imported, updated, skipped, errors };
}
