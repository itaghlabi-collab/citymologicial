/**
 * workerPayroll.js — Paiement hebdomadaire ouvriers (tarif journalier)
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName, listAttendance, computeAttendanceWorkMetrics, filterAttendanceForWorkerWeek, filterAttendanceForWorkerProject, sumWorkerAttendanceFromRecords, sumWorkerAttendanceForProject } from './attendance';
import { listOvertime, sumWorkerOvertimeFromRecords } from './overtime';
import { listWorkers, workerTarifHoraire, workerTarifJournalier, WORKER_HOURS_PER_DAY } from './workers';
import { listProjects } from '../projects/projects';
import { syncFinanceTransaction, FINANCE_SOURCE_TYPES } from '../finance/financeSync';

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
    paymentDate: row.payment_date || row.semaine_debut || '',
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
    payment_date: semaineDebut,
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
  const rows = lines.map((line) => toWorkerPayrollRow(line, { ...batchMeta, batchId, semaineFin, autoGenerated: false }));

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
    tarif_journalier: totals.tarifJournalier,
    heures_sup: totals.heuresSup,
    tarif_heures_sup: totals.tarifSup,
    montant_heures_sup: totals.montantSup,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montantBrut,
    montant_net: totals.montantNet,
    statut: UI_TO_DB_STATUT[form.statut] || 'En attente',
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
  await syncFinanceTransaction(FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, id, { entity: normalized });
  return normalized;
}

export async function updateWorkerPayrollStatut(id, statutUi) {
  await getAuthUserId();
  const statut = UI_TO_DB_STATUT[statutUi] || statutUi;
  const patch = { statut };
  if (statutUi === 'Payé' || statut === 'Paye') {
    patch.payment_date = todayIso();
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
  const syncResult = await syncFinanceTransaction(FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, id, { entity: normalized });
  if (statutUi === 'Payé' && syncResult?.action === 'skipped') {
    const err = new Error('Paiement enregistré mais montant nul — aucune ligne caisse créée.');
    err.code = 'SYNC_SKIP';
    throw err;
  }
  return normalized;
}

/** Rattrapage : synchronise tous les paiements ouvriers déjà « Payé » vers la caisse. */
export async function backfillWorkerPayrollToCash() {
  const rows = await listWorkerPayroll();
  let synced = 0;
  for (const p of rows) {
    if (p.statut !== 'Payé') continue;
    if (!Number(p.total)) continue;
    const r = await syncFinanceTransaction(FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, p.id, { entity: p });
    if (r?.action === 'created' || r?.action === 'updated') synced += 1;
  }
  return synced;
}

export async function updateWorkerPayrollAdjustments(id, existing, adjustments = {}) {
  await getAuthUserId();
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
    statut: adjustments.statut ?? existing.statut,
    notes: adjustments.notes ?? existing.notes,
    reference: existing.reference,
    paymentMethod: existing.paymentMethod,
  };
  return updateWorkerPayroll(id, merged);
}

export async function deleteWorkerPayroll(id) {
  await getAuthUserId();
  await syncFinanceTransaction(FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, id, {
    entity: { statut: 'Annulé', total: 0 },
    active: false,
  }).catch(() => {});
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
