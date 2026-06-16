/**
 * workerPayroll.js — Paiement hebdomadaire ouvriers (tarif journalier)
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName, listAttendance, computeAttendanceWorkMetrics, filterAttendanceForWorkerWeek, filterAttendanceForWorkerProject, sumWorkerAttendanceFromRecords, sumWorkerAttendanceForProject } from './attendance';
import { listOvertime, sumWorkerOvertimeFromRecords } from './overtime';
import { listWorkers, workerTarifHoraire, workerTarifJournalier, WORKER_HOURS_PER_DAY } from './workers';
import { listProjects } from '../projects/projects';
import {
  FINANCE_SOURCE_TYPES,
  removeLinkedFinanceTransaction,
  removeLegacyWorkerWeeklyFinanceTransactions,
  removeLegacyWorkerPaymentTypeRows,
  purgePerPayrollIdWorkerFinanceRows,
  purgeLegacyWorkerPaymentSourceType,
  isPayrollEntityPaid,
  syncFinanceTransaction,
} from '../finance/financeSync';

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

export function todayIso() {
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

/** Samedi de la semaine (lun–dim) — date caisse par défaut. */
export function weekEndSaturday(weekStart) {
  const d = new Date(`${(weekStart || weekStartMonday(todayIso()))}T12:00:00`);
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

/** @deprecated Utiliser todayIso() — la date caisse vient du champ date de paiement. */
export function defaultWorkerPaymentDate() {
  return todayIso();
}

/** Date caisse = payment_date uniquement (jamais semaine_debut / semaine_fin / paid_at). */
export function resolveWorkerCashPaymentDate(row) {
  if (!row) return todayIso();
  const paymentDate = row.paymentDate || row.payment_date;
  if (paymentDate) return String(paymentDate).slice(0, 10);
  return todayIso();
}

/** @deprecated Ne pas utiliser pour la caisse — conservé pour affichage RH uniquement. */
export function resolveWorkerPaymentDate(row) {
  return resolveWorkerCashPaymentDate(row);
}

/** Date caisse consolidée = la plus récente date de paiement réel du groupe. */
export function resolveConsolidatedCashPaymentDate(rows) {
  const dates = (rows || []).map(resolveWorkerCashPaymentDate).filter(Boolean).sort();
  return dates[dates.length - 1] || todayIso();
}

/** Calcule tarif journalier / horaire cohérents (référence = journalier). */
export function resolveWorkerRates(line = {}) {
  const tarifJournalier = Number(line.tarifJournalier) > 0
    ? round2(line.tarifJournalier)
    : round2((Number(line.tarifHoraire) || 0) * WORKER_HOURS_PER_DAY);
  const tarifHoraire = Number(line.tarifHoraire) > 0
    ? round2(line.tarifHoraire)
    : round2(tarifJournalier / WORKER_HOURS_PER_DAY);
  return { tarifJournalier, tarifHoraire };
}

/** Calcul complet d'une ligne ouvrier — base : jours × tarif journalier */
export function calcWorkerPayrollTotals(line) {
  const joursPaies = Number(line.joursPaies) || 0;
  const { tarifJournalier, tarifHoraire } = resolveWorkerRates(line);
  const heuresNormales = Number(line.heuresNormales) > 0
    ? round2(line.heuresNormales)
    : round2(joursPaies * WORKER_HOURS_PER_DAY);
  const montantNormales = round2(joursPaies * tarifJournalier);
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
    tarifJournalier,
    montantNormales,
    heuresSup,
    tarifSup,
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
    heuresNormales: row.heures_normales,
    tarifJournalier: row.tarif_journalier,
    tarifHoraire: row.tarif_horaire,
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
    paidAt: row.paid_at || null,
    paymentDate: row.payment_date || '',
    joursPaies: totals.joursPaies,
    heuresNormales: totals.heuresNormales,
    tarifHoraire: totals.tarifHoraire,
    tarifJournalier: totals.tarifJournalier,
    montantNormales: totals.montantNormales,
    heuresSup: totals.heuresSup,
    tarifSup: totals.tarifSup,
    montantSup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    total: Number(row.montant_net) || totals.montantNet,
    montantBrut: Number(row.montant_brut) || totals.montantBrut,
    statut: DB_TO_UI_STATUT[row.statut] || 'En attente',
    notes: row.notes || '',
    reference: row.reference || '',
    paymentMethod: row.payment_method || '',
    chefChantier: row.chef_chantier_nom || '',
    chefProjet: row.chef_projet || '',
    autoGenerated: row.auto_generated ?? false,
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
    payment_date: batchMeta.paymentDate
      || (((UI_TO_DB_STATUT[batchMeta.statut] || batchMeta.statut) === 'Paye') ? todayIso() : null),
    semaine_debut: semaineDebut,
    semaine_fin: semaineFin,
    chantier: batchMeta.projet?.trim() || null,
    jours_travailles: totals.joursPaies,
    heures_normales: totals.heuresNormales,
    tarif_horaire: totals.tarifHoraire,
    tarif_journalier: totals.tarifJournalier,
    heures_sup: totals.heuresSup,
    tarif_heures_sup: totals.tarifSup,
    montant_heures_sup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montantBrut,
    montant_net: totals.montantNet,
    statut: UI_TO_DB_STATUT[batchMeta.statut] || 'En attente',
    notes: batchMeta.notes?.trim() || null,
    chef_chantier_nom: batchMeta.chefChantier?.trim() || null,
    chef_projet: batchMeta.chefProjet?.trim() || null,
    auto_generated: batchMeta.autoGenerated ?? false,
    ...((UI_TO_DB_STATUT[batchMeta.statut] || batchMeta.statut) === 'Paye'
      ? { paid_at: new Date().toISOString() }
      : {}),
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

/** UUID stable = source_id unique par ouvrier × projet (anti-doublon caisse). */
export async function workerPaymentSourceId(workerId, projectId) {
  const seed = `citymo:worker_weekly_payment:${workerId}:${projectId || 'none'}`;
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const buf = new TextEncoder().encode(seed);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash.slice(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = ((h << 5) - h) + seed.charCodeAt(i);
    h |= 0;
  }
  const hex = Math.abs(h).toString(16).padStart(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function filterPayrollForWorkerProject(records, workerId, projectId) {
  return (records || []).filter(
    (p) => String(p.workerId) === String(workerId)
      && String(p.projectId || '') === String(projectId || ''),
  );
}

/** Entité caisse consolidée : 1 ligne / ouvrier × projet = net total Payé, période = dernière semaine. */
function buildConsolidatedWorkerPaymentEntity(paidRows, totalNet) {
  const sorted = [...paidRows].sort((a, b) => (a.semaineDebut || '').localeCompare(b.semaineDebut || ''));
  const latest = sorted[sorted.length - 1];
  const paymentDay = resolveConsolidatedCashPaymentDate(sorted);
  return {
    workerId: latest.workerId,
    projectId: latest.projectId,
    ouvrier: latest.ouvrier,
    projet: latest.projet,
    paid_amount: totalNet,
    net_to_pay: totalNet,
    net_amount: totalNet,
    total_net: totalNet,
    montantNet: totalNet,
    total: totalNet,
    montant_net: totalNet,
    paymentDate: paymentDay,
    paidAt: sorted.map((p) => p.paidAt).filter(Boolean).sort().pop() || null,
    semaineDebut: latest.semaineDebut,
    semaineFin: latest.semaineFin || weekEndSunday(latest.semaineDebut),
    statut: 'Payé',
    reference: latest.reference,
    paymentMethod: latest.paymentMethod,
  };
}

/** Brouillon auto « En attente » (présences) — ne bloque pas la sync caisse. */
export function isBlockingUnpaidPayrollRow(row) {
  if (!row || row.statut === 'Annulé') return false;
  if (isPayrollEntityPaid(row)) return false;
  if (row.autoGenerated && row.statut === 'En attente') return false;
  return true;
}

/** Peut-on créer la ligne caisse consolidée pour ce groupe ? */
export function canSyncWorkerPaymentGroup(rows) {
  const activeRows = (rows || []).filter((p) => p.statut !== 'Annulé');
  if (!activeRows.length) return { ok: false, reason: 'empty', activeRows, paidRows: [], totalNet: 0 };
  const paidRows = activeRows.filter((p) => isPayrollEntityPaid(p));
  if (!paidRows.length) return { ok: false, reason: 'none_paid', activeRows, paidRows, totalNet: 0 };
  if (activeRows.some(isBlockingUnpaidPayrollRow)) {
    return { ok: false, reason: 'blocking_unpaid', activeRows, paidRows, totalNet: 0 };
  }
  const totalNet = round2(paidRows.reduce((s, p) => s + (Number(p.total) || 0), 0));
  if (totalNet <= 0) return { ok: false, reason: 'zero', activeRows, paidRows, totalNet: 0 };
  return { ok: true, reason: 'ok', activeRows, paidRows, totalNet };
}

/**
 * Sync caisse : 1 ligne / ouvrier × projet (net Payé total, date = date de paiement).
 * Supprime les lignes par semaine (source_id = payroll.id) avant upsert consolidé.
 */
export async function syncWorkerPaymentGroup(workerId, projectId, options = {}) {
  if (!workerId) return { action: 'none', id: null };
  const allRecords = options.allRecords || await listWorkerPayroll();
  const rows = filterPayrollForWorkerProject(allRecords, workerId, projectId);
  const payrollIds = rows.map((p) => p.id).filter(Boolean);
  const sourceId = await workerPaymentSourceId(workerId, projectId);
  const sourceType = FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT;

  console.log('[FINANCE SYNC] syncWorkerPaymentGroup', {
    workerId, projectId, sourceType, sourceId, payrollRows: rows.length, mode: 'consolidated',
  });

  await removeLegacyWorkerWeeklyFinanceTransactions(payrollIds);
  await removeLegacyWorkerPaymentTypeRows(sourceId);

  const activeRows = rows.filter((p) => p.statut !== 'Annulé');
  if (!activeRows.length) {
    return removeLinkedFinanceTransaction(sourceType, sourceId);
  }

  const gate = canSyncWorkerPaymentGroup(activeRows);
  if (!gate.ok) {
    console.warn('[FINANCE SYNC SKIP]', gate.reason, { workerId, projectId });
    return removeLinkedFinanceTransaction(sourceType, sourceId);
  }

  const entity = buildConsolidatedWorkerPaymentEntity(gate.paidRows, gate.totalNet);
  return syncFinanceTransaction(sourceType, sourceId, { entity });
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
  const rows = lines.map((line) => toWorkerPayrollRow(line, { ...batchMeta, batchId, semaineFin, autoGenerated: false }));

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(rows)
    .select(PAYROLL_SELECT);

  if (error) {
    console.error('[CITYMO] workerPayroll batch insert', error, rows);
    throw error;
  }
  const created = (data || []).map(normalizeWorkerPayroll);
  const allRecords = await listWorkerPayroll();
  const synced = new Set();
  for (const p of created) {
    const key = `${p.workerId}|${p.projectId}`;
    if (synced.has(key)) continue;
    synced.add(key);
    await syncWorkerPaymentGroup(p.workerId, p.projectId, { allRecords });
  }
  return created;
}

export async function updateWorkerPayroll(id, form) {
  await getAuthUserId();
  const totals = calcWorkerPayrollTotals(form);
  const semaineDebut = form.semaineDebut || weekStartMonday(todayIso());
  const semaineFin = form.semaineFin || weekEndSunday(semaineDebut);

  const statutDb = UI_TO_DB_STATUT[form.statut] || form.statut || 'En attente';
  const isPaid = statutDb === 'Paye' || form.statut === 'Payé';
  const row = {
    project_id: form.projectId || null,
    payment_date: isPaid
      ? (form.paymentDate || todayIso())
      : (form.paymentDate || null),
    paid_at: isPaid ? (form.paidAt || new Date().toISOString()) : null,
    semaine_debut: semaineDebut,
    semaine_fin: semaineFin,
    chantier: form.projet?.trim() || null,
    jours_travailles: totals.joursPaies,
    heures_normales: totals.heuresNormales,
    tarif_horaire: totals.tarifHoraire,
    tarif_journalier: totals.tarifJournalier,
    heures_sup: totals.heuresSup,
    tarif_heures_sup: totals.tarifSup,
    montant_heures_sup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montantBrut,
    montant_net: totals.montantNet,
    statut: statutDb,
    notes: form.notes?.trim() || null,
    reference: form.reference?.trim() || null,
    payment_method: form.paymentMethod?.trim() || null,
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
  const normalized = normalizeWorkerPayroll(data);
  await syncWorkerPaymentGroup(normalized.workerId, normalized.projectId);
  return normalized;
}

export async function updateWorkerPayrollStatut(id, statutUi, options = {}) {
  await getAuthUserId();
  const statut = UI_TO_DB_STATUT[statutUi] || statutUi;
  const patch = { statut };
  const nowIso = new Date().toISOString();

  if (statutUi === 'Payé' || statut === 'Paye') {
    patch.payment_date = options.paymentDate || todayIso();
    patch.paid_at = nowIso;
  } else {
    patch.paid_at = null;
    patch.payment_date = null;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll statut', error, { id, statut });
    throw error;
  }
  const normalized = normalizeWorkerPayroll(data);
  const syncResult = await syncWorkerPaymentGroup(normalized.workerId, normalized.projectId);
  if ((statutUi === 'Payé' || statut === 'Paye') && syncResult?.action === 'skipped') {
    const err = new Error('Paiement enregistré mais montant nul — aucune ligne caisse créée.');
    err.code = 'SYNC_SKIP';
    throw err;
  }
  return normalized;
}

/** @deprecated Ne plus réaligner sur semaine_fin — date caisse = jour réel du paiement. */
export async function alignPaidPayrollPaymentDates() {
  return 0;
}

/** Réconciliation : 1 ligne consolidée / ouvrier × projet + purge lignes par semaine. */
export async function backfillWorkerPayrollToCash() {
  const legacyPerWeek = await purgePerPayrollIdWorkerFinanceRows();
  const legacyPaymentType = await purgeLegacyWorkerPaymentSourceType();
  const rows = await listWorkerPayroll();
  const groups = new Map();
  for (const p of rows) {
    const key = `${p.workerId}|${p.projectId}`;
    if (!groups.has(key)) groups.set(key, { workerId: p.workerId, projectId: p.projectId });
  }
  let synced = 0;
  let removed = (legacyPerWeek?.count || 0) + (legacyPaymentType?.count || 0);
  const errors = [];
  for (const { workerId, projectId } of groups.values()) {
    try {
      const r = await syncWorkerPaymentGroup(workerId, projectId, { allRecords: rows });
      if (r?.action === 'created' || r?.action === 'updated') synced += 1;
      if (r?.action === 'deleted') removed += 1;
    } catch (err) {
      console.error('[FINANCE SYNC ERROR] backfill worker group', { workerId, projectId, err });
      if (err?.code === 'SCHEMA' || err?.code === 'RLS') throw err;
      errors.push({ workerId, projectId, message: err?.message || String(err) });
    }
  }
  return {
    synced,
    removed,
    legacyPurged: (legacyPerWeek?.count || 0) + (legacyPaymentType?.count || 0),
    errors,
  };
}

export async function updateWorkerPayrollAdjustments(id, existing, adjustments = {}) {
  await getAuthUserId();
  const nextStatut = adjustments.statut ?? existing.statut;
  const statutChanged = adjustments.statut != null && adjustments.statut !== existing.statut;

  if (statutChanged) {
    return updateWorkerPayrollStatut(id, nextStatut, {
      paymentDate: adjustments.paymentDate,
      semaineDebut: existing.semaineDebut,
    });
  }

  const merged = {
    projectId: existing.projectId,
    projet: existing.projet,
    semaineDebut: existing.semaineDebut,
    semaineFin: existing.semaineFin || weekEndSunday(existing.semaineDebut),
    joursPaies: existing.joursPaies,
    heuresNormales: existing.heuresNormales,
    tarifJournalier: existing.tarifJournalier,
    tarifHoraire: existing.tarifHoraire,
    heuresSup: adjustments.heuresSup ?? existing.heuresSup,
    tarifSup: adjustments.tarifSup ?? existing.tarifSup,
    avances: adjustments.avances ?? existing.avances,
    retenues: adjustments.retenues ?? existing.retenues,
    statut: nextStatut,
    notes: adjustments.notes ?? existing.notes,
    reference: existing.reference,
    paymentMethod: existing.paymentMethod,
    paymentDate: adjustments.paymentDate ?? existing.paymentDate,
    paidAt: existing.paidAt,
  };
  return updateWorkerPayroll(id, merged);
}

export async function deleteWorkerPayroll(id) {
  await getAuthUserId();
  const { data: row } = await getSupabase()
    .from(TABLE)
    .select('worker_id, project_id')
    .eq('id', id)
    .maybeSingle();
  await removeLinkedFinanceTransaction(FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, id).catch(() => {});
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] workerPayroll delete', error, { id });
    throw error;
  }
  if (row?.worker_id) {
    await syncWorkerPaymentGroup(row.worker_id, row.project_id || '');
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

export function collectPayrollWeeks(records) {
  const set = new Set();
  (records || []).forEach((r) => { if (r.semaineDebut) set.add(r.semaineDebut); });
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function fmtWeekRange(debut, fin) {
  const d = debut ? new Date(`${debut}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  const f = fin ? new Date(`${fin}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  return `${d} - ${f}`;
}

/** Regroupe les lignes de paiement par projet (× semaine si filtre actif). */
function mergePayrollStatut(a, b) {
  if (a === b) return a;
  if (a === 'Payé' && b === 'Payé') return 'Payé';
  if (a === 'Annulé' || b === 'Annulé') return 'Mixte';
  if (a === 'En attente' || b === 'En attente') return 'En attente';
  return 'Mixte';
}

function mergePayrollLines(a, b) {
  const totals = calcWorkerPayrollTotals({
    joursPaies: round2(Number(a.joursPaies) + Number(b.joursPaies)),
    heuresNormales: round2(Number(a.heuresNormales) + Number(b.heuresNormales)),
    tarifJournalier: a.tarifJournalier,
    tarifHoraire: a.tarifHoraire,
    heuresSup: round2(Number(a.heuresSup) + Number(b.heuresSup)),
    tarifSup: a.tarifSup,
    avances: round2(Number(a.avances) + Number(b.avances)),
    retenues: round2(Number(a.retenues) + Number(b.retenues)),
  });
  const weeklyRecords = [...(a.weeklyRecords || [a]), ...(b.weeklyRecords || [b])];
  return {
    ...a,
    key: `${a.workerId}|${a.projectId}`,
    mergeAllWeeks: true,
    semaineDebut: '',
    semaineFin: '',
    weeklyRecords,
    joursPaies: totals.joursPaies,
    heuresNormales: totals.heuresNormales,
    heuresSup: totals.heuresSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montantBrut: totals.montantBrut,
    total: totals.montantNet,
    montantNormales: totals.montantNormales,
    montantSup: totals.montantSup,
    statut: mergePayrollStatut(a.statut, b.statut),
    paymentDate: resolveConsolidatedCashPaymentDate(weeklyRecords),
    autoGenerated: a.autoGenerated && b.autoGenerated,
  };
}

export function groupPayrollByProjectWeek(records, weekFilter = '') {
  const mergeWeeks = !weekFilter;
  const groups = new Map();

  for (const r of records || []) {
    if (weekFilter && r.semaineDebut !== weekFilter) continue;
    const projectKey = String(r.projectId || r.projet || '');
    const groupKey = mergeWeeks ? projectKey : `${projectKey}|${r.semaineDebut}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        projectId: r.projectId,
        projet: r.projet || '—',
        semaineDebut: mergeWeeks ? '' : r.semaineDebut,
        semaineFin: mergeWeeks ? '' : (r.semaineFin || weekEndSunday(r.semaineDebut)),
        chefProjet: r.chefProjet || '',
        chefChantier: r.chefChantier || '',
        ligneMap: new Map(),
        totalNet: 0,
        totalBrut: 0,
      });
    }
    const g = groups.get(groupKey);
    const workerKey = String(r.workerId);
    if (!g.ligneMap.has(workerKey)) {
      g.ligneMap.set(workerKey, { ...r, key: mergeWeeks ? `${r.workerId}|${r.projectId}` : r.id, weeklyRecords: [r] });
    } else {
      g.ligneMap.set(workerKey, mergePayrollLines(g.ligneMap.get(workerKey), r));
    }
    if (!g.chefProjet && r.chefProjet) g.chefProjet = r.chefProjet;
    if (!g.chefChantier && r.chefChantier) g.chefChantier = r.chefChantier;
  }

  return [...groups.values()].map((g) => {
    const lignes = [...g.ligneMap.values()];
    delete g.ligneMap;
    g.totalNet = round2(lignes.reduce((s, p) => s + (Number(p.total) || 0), 0));
    g.totalBrut = round2(lignes.reduce((s, p) => s + (Number(p.montantBrut) || 0), 0));
    return { ...g, lignes };
  }).sort((a, b) => {
    if (!mergeWeeks) {
      const da = a.semaineDebut || '';
      const db = b.semaineDebut || '';
      if (da !== db) return db.localeCompare(da);
    }
    return (a.projet || '').localeCompare(b.projet || '', 'fr');
  });
}

/** Agrège les présences en brouillons de paiement (projet × semaine × ouvrier). */
export function buildAttendancePayrollDrafts({ attendance, workers, overtime, projects }) {
  const bucket = new Map();

  for (const att of attendance || []) {
    if (!att.workerId || !att.date) continue;
    const projectId = att.projectId || att.workerProjectId;
    if (!projectId) continue;

    const weekStart = weekStartMonday(att.date);
    const metrics = computeAttendanceWorkMetrics(att);
    if (metrics.joursEquivalent <= 0) continue;

    const key = `${projectId}|${weekStart}|${att.workerId}`;
    if (!bucket.has(key)) {
      const project = (projects || []).find((p) => String(p.id) === String(projectId));
      bucket.set(key, {
        workerId: att.workerId,
        projectId: String(projectId),
        projet: att.projet || project?.nom || '',
        semaineDebut: weekStart,
        semaineFin: weekEndSunday(weekStart),
        joursPaies: 0,
        heuresTravaillees: 0,
        chefCounts: {},
        chefProjet: project?.chef_projet || project?.responsable || '',
        chefChantier: project?.chef_chantier || '',
      });
    }
    const entry = bucket.get(key);
    entry.joursPaies = round2(entry.joursPaies + metrics.joursEquivalent);
    entry.heuresTravaillees = round2(entry.heuresTravaillees + metrics.heuresTravaillees);
    const chef = (att.chefChantier || '').trim();
    if (chef) entry.chefCounts[chef] = (entry.chefCounts[chef] || 0) + 1;
  }

  const drafts = [];
  for (const entry of bucket.values()) {
    const chefs = Object.entries(entry.chefCounts).sort((a, b) => b[1] - a[1]);
    if (chefs.length) entry.chefChantier = chefs[0][0];

    const worker = (workers || []).find((w) => String(w.id) === String(entry.workerId));
    if (!worker) continue;

    const project = (projects || []).find((p) => String(p.id) === String(entry.projectId));
    if (!entry.chefProjet) entry.chefProjet = project?.chef_projet || project?.responsable || '';
    if (!entry.chefChantier) entry.chefChantier = project?.chef_chantier || '';

    const ot = sumWorkerOvertimeFromRecords(
      overtime,
      entry.workerId,
      entry.semaineDebut,
      entry.semaineFin,
      entry.projet,
    );

    const line = buildWorkerPayrollLine(worker, {
      joursPaies: entry.joursPaies,
      heuresNormales: entry.heuresTravaillees,
      heuresSup: ot.heures > 0 ? ot.heures : 0,
      avgTarifSup: ot.avgTarif,
      fromPresence: true,
    });

    const totals = calcWorkerPayrollTotals({ ...line, avances: 0, retenues: 0 });

    drafts.push({
      workerId: entry.workerId,
      projectId: entry.projectId,
      projet: entry.projet,
      semaineDebut: entry.semaineDebut,
      semaineFin: entry.semaineFin,
      chefChantier: entry.chefChantier,
      chefProjet: entry.chefProjet,
      ...totals,
      autoGenerated: true,
    });
  }
  return drafts;
}

function payrollDraftKey(d) {
  return `${d.workerId}|${d.projectId}|${d.semaineDebut}`;
}

/** Recalcule jours, heures et montants depuis les présences. */
export function enrichPayrollWithAttendance(payrollLine, attendance = []) {
  if (!payrollLine) return null;

  const mergeAll = payrollLine.mergeAllWeeks || !payrollLine.semaineDebut;

  const presenceLignes = mergeAll
    ? filterAttendanceForWorkerProject(attendance, {
      workerId: payrollLine.workerId,
      projectId: payrollLine.projectId,
    })
    : filterAttendanceForWorkerWeek(attendance, {
      workerId: payrollLine.workerId,
      projectId: payrollLine.projectId,
      semaineDebut: payrollLine.semaineDebut,
      semaineFin: payrollLine.semaineFin,
    });

  const attSum = mergeAll
    ? sumWorkerAttendanceForProject(attendance, payrollLine.workerId, payrollLine.projectId)
    : sumWorkerAttendanceFromRecords(
      attendance,
      payrollLine.workerId,
      payrollLine.projectId,
      payrollLine.semaineDebut,
      payrollLine.semaineFin,
    );

  const fromPresence = presenceLignes.length > 0;
  const joursPaies = fromPresence ? attSum.joursEquivalent : Number(payrollLine.joursPaies) || 0;
  const heuresNormales = fromPresence ? attSum.heuresTravaillees : Number(payrollLine.heuresNormales) || 0;

  const totals = calcWorkerPayrollTotals({
    joursPaies,
    heuresNormales,
    tarifJournalier: payrollLine.tarifJournalier,
    tarifHoraire: payrollLine.tarifHoraire,
    heuresSup: payrollLine.heuresSup,
    tarifSup: payrollLine.tarifSup,
    avances: payrollLine.avances,
    retenues: payrollLine.retenues,
  });

  const nbJoursTravailles = presenceLignes.filter((d) => (d.joursEquivalent || 0) > 0).length;
  const totalRetard = round2(presenceLignes.reduce((s, d) => s + (Number(d.retardHeures) || 0), 0));

  return {
    ...payrollLine,
    joursPaies: totals.joursPaies,
    heuresNormales: totals.heuresNormales,
    montantNormales: totals.montantNormales,
    montantBrut: totals.montantBrut,
    total: totals.montantNet,
    montantSup: totals.montantSup,
    presenceLignes,
    nbJoursTravailles: nbJoursTravailles || (joursPaies > 0 ? 1 : 0),
    nbPresences: presenceLignes.length,
    totalRetard,
    mergeAllWeeks: mergeAll,
  };
}

/** Crée ou met à jour les paiements ouvriers depuis les présences. */
export async function syncWorkerPayrollFromAttendance(ctx) {
  await getAuthUserId();
  const existing = ctx.existingRecords || await listWorkerPayroll();
  const drafts = buildAttendancePayrollDrafts(ctx);
  const draftKeys = new Set(drafts.map(payrollDraftKey));
  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const draft of drafts) {
    const match = existing.find(
      (e) => String(e.workerId) === String(draft.workerId)
        && String(e.projectId) === String(draft.projectId)
        && e.semaineDebut === draft.semaineDebut,
    );

    if (match && (match.statut === 'Payé' || match.statut === 'Annulé')) continue;

    const avances = match ? Number(match.avances) || 0 : 0;
    const retenues = match ? Number(match.retenues) || 0 : 0;
    const notes = match?.notes || '';
    const statut = match?.statut || 'En attente';

    const linePayload = {
      workerId: draft.workerId,
      joursPaies: draft.joursPaies,
      heuresNormales: draft.heuresNormales,
      tarifJournalier: draft.tarifJournalier,
      tarifHoraire: draft.tarifHoraire,
      heuresSup: draft.heuresSup,
      tarifSup: draft.tarifSup,
      avances,
      retenues,
    };

    const batchMeta = {
      projectId: draft.projectId,
      projet: draft.projet,
      semaineDebut: draft.semaineDebut,
      semaineFin: draft.semaineFin,
      statut,
      notes,
      chefChantier: draft.chefChantier,
      chefProjet: draft.chefProjet,
      autoGenerated: true,
    };

    const row = toWorkerPayrollRow(linePayload, batchMeta);

    if (match) {
      const { error } = await getSupabase()
        .from(TABLE)
        .update(row)
        .eq('id', match.id);
      if (error) {
        console.error('[CITYMO] workerPayroll sync update', error, { id: match.id });
        throw error;
      }
      updated += 1;
    } else {
      if (!draft.joursPaies || draft.joursPaies <= 0) continue;
      const { error } = await getSupabase().from(TABLE).insert(row);
      if (error) {
        console.error('[CITYMO] workerPayroll sync insert', error, row);
        throw error;
      }
      created += 1;
    }
  }

  for (const e of existing) {
    if (!e.autoGenerated) continue;
    if (e.statut === 'Payé' || e.statut === 'Annulé') continue;
    const key = payrollDraftKey(e);
    if (draftKeys.has(key)) continue;
    const { error } = await getSupabase().from(TABLE).delete().eq('id', e.id);
    if (error) {
      console.error('[CITYMO] workerPayroll sync delete stale', error, { id: e.id });
      throw error;
    }
    removed += 1;
  }

  return { created, updated, removed };
}

/** Sync autonome après modification de présence (fire-and-forget). */
export async function syncPayrollAfterAttendanceChange() {
  try {
    const [attendance, workers, overtime, projects, existingRecords] = await Promise.all([
      listAttendance().catch(() => []),
      listWorkers().catch(() => []),
      listOvertime().catch(() => []),
      listProjects().catch(() => []),
      listWorkerPayroll().catch(() => []),
    ]);
    const result = await syncWorkerPayrollFromAttendance({ attendance, workers, overtime, projects, existingRecords });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('citymo:attendance-changed', { detail: result }));
    }
    return result;
  } catch (err) {
    console.warn('[CITYMO] syncPayrollAfterAttendanceChange', err);
    return { created: 0, updated: 0, removed: 0, error: err.message };
  }
}

/** Prépare une ligne de paiement à partir de l'ouvrier + présences / heures sup. */
export function buildWorkerPayrollLine(worker, presenceData = {}) {
  const tarifH = workerTarifHoraire(worker);
  const tarifJ = workerTarifJournalier(worker);
  const heuresSup = presenceData.heuresSup ?? '';
  const tarifSup = presenceData.avgTarifSup != null
    ? round2(presenceData.avgTarifSup)
    : round2(tarifH * 1.25);

  return {
    workerId: worker.id,
    joursPaies: presenceData.joursPaies ?? '',
    heuresNormales: presenceData.heuresNormales ?? '',
    heuresSup,
    tarifHoraire: tarifH,
    tarifJournalier: tarifJ,
    tarifSup,
    avances: '',
    retenues: '',
    fonction: worker.fonction || '',
    fullName: workerFullName(worker),
    fromPresence: presenceData.fromPresence ?? false,
  };
}

export { workerTarifHoraire, workerTarifJournalier, WORKER_HOURS_PER_DAY };
