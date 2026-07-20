/**
 * Helpers étape 4 — sync paie après import Excel.
 * Aucune formule : uniquement syncWorkerPayrollFromAttendance.
 * Étape 5 Finance : déclenchée au paiement RH via syncWorkerPaymentGroup
 * (caisse + dépense projet client / dépense générale ATELIER·DÉPÔT).
 */
import { listAttendance, weekStartMonday } from './attendance';
import { listOvertime } from './overtime';
import { listWorkers } from './workers';
import { listProjects } from '../projects/projects';
import {
  listWorkerPayroll,
  syncWorkerPayrollFromAttendance,
} from './workerPayroll';

/**
 * Ventilation informative (jours) — pas un calcul de salaire.
 * Pourcentage = jours présents par affectation / total jours.
 */
export function buildCostVentilationPreview(plannedLines = []) {
  const byWorker = new Map();

  for (const line of plannedLines) {
    if (line.statut !== 'present' || !line.ready) continue;
    const wid = line.workerId || line.workerKey;
    if (!wid) continue;
    if (!byWorker.has(wid)) {
      byWorker.set(wid, {
        workerId: line.workerId,
        workerLabel: line.workerLabel || line.workerExcelName,
        totalDays: 0,
        buckets: new Map(),
      });
    }
    const w = byWorker.get(wid);
    const dayWeight = 1;
    w.totalDays += dayWeight;
    const key = line.projectId || line.siteKey;
    const label = line.projectLabel || line.siteTitle;
    const kind = line.siteKind || 'project';
    if (!w.buckets.has(key)) {
      w.buckets.set(key, {
        projectId: line.projectId,
        label,
        kind,
        affectationLabel: line.affectationLabel,
        days: 0,
        isInternal: kind === 'internal_atelier' || kind === 'internal_depot',
      });
    }
    w.buckets.get(key).days += dayWeight;
  }

  return [...byWorker.values()].map((w) => {
    const parts = [...w.buckets.values()].map((b) => ({
      ...b,
      pct: w.totalDays > 0 ? Math.round((b.days / w.totalDays) * 1000) / 10 : 0,
    }));
    return {
      workerId: w.workerId,
      workerLabel: w.workerLabel,
      totalDays: w.totalDays,
      parts: parts.sort((a, b) => b.days - a.days),
      clientParts: parts.filter((p) => !p.isInternal),
      internalParts: parts.filter((p) => p.isInternal),
    };
  });
}

/**
 * Détecte paies déjà présentes pour les ouvriers / semaines de l’import.
 */
export function detectPayrollConflictsForImport({
  plannedLines = [],
  payrollRecords = [],
} = {}) {
  const weekStarts = new Set();
  const workerIds = new Set();
  for (const line of plannedLines) {
    if (!line.ready || !line.workerId || !line.date) continue;
    workerIds.add(String(line.workerId));
    weekStarts.add(weekStartMonday(line.date));
  }

  const paid = [];
  const pending = [];

  for (const p of payrollRecords || []) {
    if (!workerIds.has(String(p.workerId))) continue;
    if (!weekStarts.has(p.semaineDebut)) continue;
    const item = {
      id: p.id,
      workerId: p.workerId,
      workerLabel: p.ouvrier || p.workerId,
      projectId: p.projectId,
      projet: p.projet || p.chantier || '',
      semaineDebut: p.semaineDebut,
      semaineFin: p.semaineFin,
      statut: p.statut,
      montantNet: p.montantNet ?? p.total,
    };
    if (p.statut === 'Payé') paid.push(item);
    else if (p.statut !== 'Annulé') pending.push(item);
  }

  return {
    weekStarts: [...weekStarts],
    workerCount: workerIds.size,
    paid,
    pending,
    hasPaid: paid.length > 0,
    hasPending: pending.length > 0,
    alreadySynced: paid.length + pending.length > 0,
  };
}

/**
 * Mode :
 * - sync : appelle le moteur officiel (met à jour les brouillons, ignore Payé)
 * - skip : n’appelle pas la sync paie
 */
export async function syncPayrollAfterExcelImport({
  mode = 'sync',
  importMeta = null,
} = {}) {
  if (mode === 'skip' || mode === 'ignore') {
    return { skipped: true, created: 0, updated: 0, removed: 0, skippedPaid: 0 };
  }

  const [attendance, workers, overtime, projects, existingRecords] = await Promise.all([
    listAttendance().catch(() => []),
    listWorkers().catch(() => []),
    listOvertime().catch(() => []),
    listProjects().catch(() => []),
    listWorkerPayroll().catch(() => []),
  ]);

  return syncWorkerPayrollFromAttendance({
    attendance,
    workers,
    overtime,
    projects,
    existingRecords,
    importMeta: importMeta || null,
  });
}
