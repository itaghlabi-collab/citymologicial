/**
 * overtime.js — Heures supplémentaires CRUD (Supabase public.overtime)
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';

const TABLE = 'overtime';

export const UI_STATUTS = ['Brouillon', 'Valide', 'Paye'];

const UI_TO_DB_STATUT = {
  Brouillon: 'brouillon',
  Valide: 'valide',
  Paye: 'paye',
};

const DB_TO_UI_STATUT = {
  brouillon: 'Brouillon',
  valide: 'Valide',
  paye: 'Paye',
};

function fmtTime(raw) {
  if (!raw) return '';
  const s = String(raw);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Calcule le nombre d'heures (0.5 pas) depuis heure début/fin. */
export function calcHoursFromTimes(debut, fin) {
  if (!debut || !fin) return null;
  const [dh, dm] = debut.split(':').map(Number);
  const [fh, fm] = fin.split(':').map(Number);
  if ([dh, dm, fh, fm].some((n) => Number.isNaN(n))) return null;
  let mins = (fh * 60 + fm) - (dh * 60 + dm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round(mins / 30) / 2;
}

export function calcOvertimeAmount(heures, tarif) {
  const h = Number(heures) || 0;
  const t = Number(tarif) || 0;
  return Math.round(h * t * 100) / 100;
}

/** DB row → shape HeuresSupp.jsx */
export function normalizeOvertime(row) {
  if (!row) return null;
  const w = row.workers;
  const heures = Number(row.nombre_heures) || 0;
  const tarif = Number(row.taux_horaire) || 0;
  return {
    id: row.id,
    workerId: row.worker_id || '',
    ouvrier: workerFullName(w) || '—',
    projet: row.chantier || '',
    date: row.date || '',
    heureDebut: fmtTime(row.heure_debut),
    heureFin: fmtTime(row.heure_fin),
    heures,
    tarif,
    montant: Number(row.montant) || calcOvertimeAmount(heures, tarif),
    motif: row.motif || '',
    statut: DB_TO_UI_STATUT[row.statut] || 'Valide',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Form UI → DB row (montant + heures calculés) */
export function toOvertimeRow(form) {
  let heures = Number(form.heures);
  if ((!heures || heures <= 0) && form.heureDebut && form.heureFin) {
    const computed = calcHoursFromTimes(form.heureDebut, form.heureFin);
    if (computed) heures = computed;
  }
  const tarif = Number(form.tarif) || 0;
  const montant = calcOvertimeAmount(heures, tarif);

  return {
    worker_id: form.workerId || null,
    date: form.date,
    chantier: form.projet?.trim() || null,
    heure_debut: form.heureDebut || null,
    heure_fin: form.heureFin || null,
    nombre_heures: heures || 0,
    taux_horaire: tarif,
    montant,
    motif: form.motif?.trim() || null,
    statut: UI_TO_DB_STATUT[form.statut] || 'valide',
  };
}

const OVERTIME_SELECT = `
  *,
  workers ( id, prenom, nom, chantier, tarif )
`;

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export async function listOvertime() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(OVERTIME_SELECT)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] overtime list', error);
    throw error;
  }
  return (data || []).map(normalizeOvertime);
}

export async function createOvertime(form) {
  await getAuthUserId();
  const row = toOvertimeRow(form);

  if (!row.worker_id) {
    const err = new Error('Ouvrier requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.date) {
    const err = new Error('Date requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.chantier) {
    const err = new Error('Projet / chantier requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.nombre_heures || row.nombre_heures <= 0) {
    const err = new Error('Nombre d\'heures valide requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.taux_horaire || row.taux_horaire <= 0) {
    const err = new Error('Tarif horaire valide requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(OVERTIME_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] overtime insert', error, row);
    throw error;
  }
  return normalizeOvertime(data);
}

export async function updateOvertime(id, form) {
  await getAuthUserId();
  const row = toOvertimeRow(form);

  if (!row.worker_id || !row.date || !row.chantier) {
    const err = new Error('Ouvrier, date et projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.nombre_heures || row.nombre_heures <= 0 || !row.taux_horaire || row.taux_horaire <= 0) {
    const err = new Error('Heures et tarif valides requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(OVERTIME_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] overtime update', error, { id, row });
    throw error;
  }
  return normalizeOvertime(data);
}

export async function deleteOvertime(id) {
  await getAuthUserId();

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] overtime delete', error, { id });
    throw error;
  }
}

export function filterOvertimeRecords(records, filters = {}) {
  const {
    ouvrier = '',
    projet = '',
    date = '',
    statut = '',
  } = filters;

  return (records || []).filter((r) => {
    if (ouvrier && r.ouvrier !== ouvrier) return false;
    if (projet && r.projet !== projet) return false;
    if (date && r.date !== date) return false;
    if (statut && r.statut !== statut) return false;
    return true;
  });
}

export function computeOvertimeStats(records) {
  const list = records || [];
  const totalHeures = list.reduce((s, r) => s + Number(r.heures || 0), 0);
  const totalMontant = list.reduce((s, r) => s + Number(r.montant || 0), 0);
  return {
    totalHeures,
    totalMontant,
    count: list.length,
  };
}

export function collectOvertimeChantiers(workers, records) {
  const set = new Set();
  (workers || []).forEach((w) => { if (w.chantier?.trim()) set.add(w.chantier.trim()); });
  (records || []).forEach((r) => { if (r.projet?.trim()) set.add(r.projet.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Tarif horaire sup suggéré (tarif journalier ouvrier × 1.25 / 8h) */
export function suggestHourlyRate(worker) {
  const daily = Number(worker?.tarif) || 0;
  if (!daily) return '';
  return String(Math.round((daily / 8) * 1.25));
}
