/**
 * workerPayroll.js — Paiement hebdomadaire ouvriers
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';
import { workerTarifHoraire, WORKER_HOURS_PER_DAY } from './workers';

const TABLE = 'payroll';

export const PAYROLL_UI_STATUTS = ['En attente', 'Payé', 'Partiellement payé', 'Annulé'];

const DB_TO_UI_STATUT = {
  Brouillon: 'En attente',
  Valide: 'En attente',
  'En attente': 'En attente',
  Paye: 'Payé',
  'Partiellement paye': 'Partiellement payé',
  Annule: 'Annulé',
};

const UI_TO_DB_STATUT = {
  'En attente': 'En attente',
  'Payé': 'Paye',
  'Partiellement payé': 'Partiellement paye',
  'Annulé': 'Annule',
};

const PAYROLL_SELECT = `
  *,
  workers ( id, prenom, nom, fonction, chantier, tarif, tarif_unite, project_id )
`;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Lundi de la semaine ISO pour une date YYYY-MM-DD. */
export function weekStartMonday(isoDate) {
  const d = new Date(`${isoDate || todayIso()}T12:00:00`);
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

/** Calcul complet d'une ligne ouvrier */
export function calcWorkerPayrollTotals(line) {
  const joursPaies = Number(line.joursPaies) || 0;
  const tarifHoraire = Number(line.tarifHoraire) || 0;
  const heuresNormales = round2(joursPaies * WORKER_HOURS_PER_DAY);
  const montantNormales = round2(heuresNormales * tarifHoraire);
  const heuresSup = Number(line.heuresSup) || 0;
  const tarifSup = Number(line.tarifSup) || round2(tarifHoraire * 1.25);
  const montantSup = round2(heuresSup * tarifSup);
  const avances = Number(line.avances) || 0;
  const retenues = Number(line.retenues) || 0;
  const montantBrut = round2(montantNormales + montantSup);
  const montantNet = round2(Math.max(0, montantBrut - avances - retenues));
  return {
    joursPaies,
    heuresNormales,
    tarifHoraire,
    heuresSup,
    tarifSup,
    montantNormales,
    montantSup,
    avances,
    retenues,
    montantBrut,
    montantNet,
  };
}

/** DB row → shape PaiementHebdo.jsx */
export function normalizeWorkerPayroll(row) {
  if (!row) return null;
  const w = row.workers;
  const totals = calcWorkerPayrollTotals({
    joursPaies: row.jours_travailles,
    tarifHoraire: row.tarif_horaire || round2(Number(row.tarif_journalier) / WORKER_HOURS_PER_DAY),
    heuresSup: row.heures_sup,
    tarifSup: row.tarif_heures_sup,
    avances: row.avances,
    retenues: row.retenues,
  });
  return {
    id: row.id,
    batchId: row.batch_id || '',
    workerId: row.worker_id || '',
    ouvrier: workerFullName(w) || '—',
    fonction: w?.fonction || '',
    projet: row.chantier || w?.chantier || '',
    projectId: row.project_id ? String(row.project_id) : '',
    semaineDebut: row.semaine_debut || '',
    semaineFin: row.semaine_fin || '',
    paymentDate: row.payment_date || row.semaine_debut || '',
    joursPaies: totals.joursPaies,
    heuresNormales: totals.heuresNormales,
    tarifHoraire: totals.tarifHoraire,
    heuresSup: totals.heuresSup,
    tarifSup: totals.tarifSup,
    montantSup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    total: Number(row.montant_net) || totals.montantNet,
    montantBrut: Number(row.montant_brut) || totals.montantBrut,
    statut: DB_TO_UI_STATUT[row.statut] || 'En attente',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toWorkerPayrollRow(line, batchMeta) {
  const totals = calcWorkerPayrollTotals(line);
  const semaineDebut = batchMeta.semaineDebut || weekStartMonday(todayIso());
  const semaineFin = batchMeta.semaineFin || weekEndSunday(semaineDebut);
  return {
    worker_id: line.workerId || null,
    project_id: batchMeta.projectId || null,
    batch_id: batchMeta.batchId || null,
    payment_date: semaineDebut,
    semaine_debut: semaineDebut,
    semaine_fin: semaineFin,
    chantier: batchMeta.projet?.trim() || null,
    jours_travailles: totals.joursPaies,
    heures_normales: totals.heuresNormales,
    tarif_horaire: totals.tarifHoraire,
    tarif_journalier: round2(totals.tarifHoraire * WORKER_HOURS_PER_DAY),
    heures_sup: totals.heuresSup,
    tarif_heures_sup: totals.tarifSup,
    montant_heures_sup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montantBrut,
    montant_net: totals.montantNet,
    statut: UI_TO_DB_STATUT[batchMeta.statut] || 'En attente',
    notes: batchMeta.notes?.trim() || null,
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

export async function listWorkerPayroll() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PAYROLL_SELECT)
    .not('worker_id', 'is', null)
    .order('semaine_debut', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] workerPayroll list', error);
    throw error;
  }
  return (data || []).map(normalizeWorkerPayroll);
}

export async function createWorkerPayrollBatch(batchMeta, lines) {
  await getAuthUserId();
  if (!batchMeta?.projectId) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!batchMeta?.semaineDebut) {
    const err = new Error('Semaine requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!lines?.length) {
    const err = new Error('Sélectionnez au moins un ouvrier.');
    err.code = 'VALIDATION';
    throw err;
  }

  const batchId = crypto.randomUUID();
  const semaineFin = batchMeta.semaineFin || weekEndSunday(batchMeta.semaineDebut);
  const rows = lines.map((line) => toWorkerPayrollRow(line, { ...batchMeta, batchId, semaineFin }));

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(rows)
    .select(PAYROLL_SELECT);

  if (error) {
    console.error('[CITYMO] workerPayroll batch insert', error, rows);
    throw error;
  }
  return (data || []).map(normalizeWorkerPayroll);
}

export async function updateWorkerPayroll(id, form) {
  await getAuthUserId();
  const totals = calcWorkerPayrollTotals(form);
  const semaineDebut = form.semaineDebut || weekStartMonday(todayIso());
  const semaineFin = form.semaineFin || weekEndSunday(semaineDebut);

  const row = {
    project_id: form.projectId || null,
    payment_date: semaineDebut,
    semaine_debut: semaineDebut,
    semaine_fin: semaineFin,
    chantier: form.projet?.trim() || null,
    jours_travailles: totals.joursPaies,
    heures_normales: totals.heuresNormales,
    tarif_horaire: totals.tarifHoraire,
    tarif_journalier: round2(totals.tarifHoraire * WORKER_HOURS_PER_DAY),
    heures_sup: totals.heuresSup,
    tarif_heures_sup: totals.tarifSup,
    montant_heures_sup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montantBrut,
    montant_net: totals.montantNet,
    statut: UI_TO_DB_STATUT[form.statut] || 'En attente',
    notes: form.notes?.trim() || null,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll update', error, { id, row });
    throw error;
  }
  return normalizeWorkerPayroll(data);
}

export async function updateWorkerPayrollStatut(id, statutUi) {
  await getAuthUserId();
  const statut = UI_TO_DB_STATUT[statutUi] || statutUi;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut })
    .eq('id', id)
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll statut', error, { id, statut });
    throw error;
  }
  return normalizeWorkerPayroll(data);
}

export async function deleteWorkerPayroll(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] workerPayroll delete', error, { id });
    throw error;
  }
}

export function filterWorkerPayroll(records, filters = {}) {
  const { search = '', projet = '', statut = '', semaine = '' } = filters;

  return (records || []).filter((p) => {
    if (search && !p.ouvrier.toLowerCase().includes(search.toLowerCase())) return false;
    if (projet && p.projet !== projet) return false;
    if (statut && p.statut !== statut) return false;
    if (semaine && p.semaineDebut !== semaine) return false;
    return true;
  });
}

export function computePayrollStats(records) {
  const list = records || [];
  const totalAPayer = list.reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPaye = list.filter((p) => p.statut === 'Payé').reduce((s, p) => s + Number(p.total || 0), 0);
  return {
    totalAPayer,
    totalPaye,
    totalPartiel: list.filter((p) => p.statut === 'Partiellement payé').reduce((s, p) => s + Number(p.total || 0), 0),
    totalEnAttente: list.filter((p) => p.statut === 'En attente').reduce((s, p) => s + Number(p.total || 0), 0),
    nbEnAttente: list.filter((p) => p.statut === 'En attente').length,
    count: list.length,
  };
}

export function collectPayrollChantiers(projects, records) {
  const set = new Set();
  (projects || []).forEach((p) => { if (p.nom?.trim()) set.add(p.nom.trim()); });
  (records || []).forEach((r) => { if (r.projet?.trim()) set.add(r.projet.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function buildWorkerPayrollLine(worker) {
  const tarifH = workerTarifHoraire(worker);
  return {
    workerId: worker.id,
    joursPaies: '',
    heuresSup: '',
    tarifHoraire: tarifH,
    tarifSup: round2(tarifH * 1.25),
    avances: '',
    retenues: '',
    fonction: worker.fonction || '',
    fullName: workerFullName(worker),
  };
}

export { workerTarifHoraire, WORKER_HOURS_PER_DAY };
