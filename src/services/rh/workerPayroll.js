/**
 * workerPayroll.js — Paiement ouvriers par projet (heures × tarif horaire)
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

export function calcWorkerLineAmount(heures, tarifHoraire) {
  return round2((Number(heures) || 0) * (Number(tarifHoraire) || 0));
}

/** DB row → shape PaiementHebdo.jsx */
export function normalizeWorkerPayroll(row) {
  if (!row) return null;
  const w = row.workers;
  const heures = Number(row.heures_normales) || round2(Number(row.jours_travailles) * WORKER_HOURS_PER_DAY);
  const tarifH = Number(row.tarif_horaire) || round2(Number(row.tarif_journalier) / WORKER_HOURS_PER_DAY);
  const total = Number(row.montant_net) || calcWorkerLineAmount(heures, tarifH);
  return {
    id: row.id,
    batchId: row.batch_id || '',
    workerId: row.worker_id || '',
    ouvrier: workerFullName(w) || '—',
    fonction: w?.fonction || '',
    projet: row.chantier || w?.chantier || '',
    projectId: row.project_id ? String(row.project_id) : '',
    paymentDate: row.payment_date || row.semaine_debut || '',
    heures,
    tarifHoraire: tarifH,
    total,
    statut: DB_TO_UI_STATUT[row.statut] || 'En attente',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toWorkerPayrollRow(line, batchMeta) {
  const heures = round2(line.heures);
  const tarifH = round2(line.tarifHoraire);
  const montant = calcWorkerLineAmount(heures, tarifH);
  const paymentDate = batchMeta.paymentDate || todayIso();
  return {
    worker_id: line.workerId || null,
    project_id: batchMeta.projectId || null,
    batch_id: batchMeta.batchId || null,
    payment_date: paymentDate,
    semaine_debut: paymentDate,
    semaine_fin: paymentDate,
    chantier: batchMeta.projet?.trim() || null,
    heures_normales: heures,
    jours_travailles: round2(heures / WORKER_HOURS_PER_DAY),
    tarif_horaire: tarifH,
    tarif_journalier: round2(tarifH * WORKER_HOURS_PER_DAY),
    heures_sup: 0,
    tarif_heures_sup: 0,
    montant_heures_sup: 0,
    avances: 0,
    retenues: 0,
    montant_brut: montant,
    montant_net: montant,
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
    .order('payment_date', { ascending: false, nullsFirst: false })
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
  if (!lines?.length) {
    const err = new Error('Sélectionnez au moins un ouvrier.');
    err.code = 'VALIDATION';
    throw err;
  }

  const batchId = crypto.randomUUID();
  const rows = lines.map((line) => toWorkerPayrollRow(line, { ...batchMeta, batchId }));

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
  const heures = round2(form.heures);
  const tarifH = round2(form.tarifHoraire);
  const montant = calcWorkerLineAmount(heures, tarifH);
  const paymentDate = form.paymentDate || todayIso();

  const row = {
    project_id: form.projectId || null,
    payment_date: paymentDate,
    semaine_debut: paymentDate,
    semaine_fin: paymentDate,
    chantier: form.projet?.trim() || null,
    heures_normales: heures,
    jours_travailles: round2(heures / WORKER_HOURS_PER_DAY),
    tarif_horaire: tarifH,
    tarif_journalier: round2(tarifH * WORKER_HOURS_PER_DAY),
    heures_sup: 0,
    tarif_heures_sup: 0,
    montant_heures_sup: 0,
    avances: 0,
    retenues: 0,
    montant_brut: montant,
    montant_net: montant,
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
  const {
    search = '',
    projet = '',
    statut = '',
    paymentDate = '',
  } = filters;

  return (records || []).filter((p) => {
    if (search && !p.ouvrier.toLowerCase().includes(search.toLowerCase())) return false;
    if (projet && p.projet !== projet) return false;
    if (statut && p.statut !== statut) return false;
    if (paymentDate && p.paymentDate !== paymentDate) return false;
    return true;
  });
}

export function computePayrollStats(records) {
  const list = records || [];
  const totalAPayer = list.reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPaye = list.filter((p) => p.statut === 'Payé').reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPartiel = list.filter((p) => p.statut === 'Partiellement payé').reduce((s, p) => s + Number(p.total || 0), 0);
  return {
    totalAPayer,
    totalPaye,
    totalPartiel,
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

export function buildWorkerPayrollLine(worker, heures = '') {
  return {
    workerId: worker.id,
    heures: heures === '' ? '' : String(heures),
    tarifHoraire: workerTarifHoraire(worker),
    fonction: worker.fonction || '',
    fullName: workerFullName(worker),
  };
}

export { workerTarifHoraire };
