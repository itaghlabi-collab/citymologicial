/**
 * useWorkerPayroll.js — Paiement ouvriers par projet (présences + tarif journalier)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listWorkers } from '../services/rh/workers';
import { workerFullName, listAttendance, countWorkerPaidDaysFromRecords } from '../services/rh/attendance';
import { listOvertime, sumWorkerOvertimeFromRecords } from '../services/rh/overtime';
import { listProjects } from '../services/projects/projects';
import {
  listWorkerPayroll,
  createWorkerPayrollBatch,
  updateWorkerPayrollAdjustments,
  updateWorkerPayrollStatut,
  deleteWorkerPayroll,
  filterWorkerPayroll,
  computePayrollStats,
  collectPayrollChantiers,
  collectPayrollWeeks,
  groupPayrollByProjectWeek,
  syncWorkerPayrollFromAttendance,
  buildWorkerPayrollLine,
  weekEndSunday,
} from '../services/rh/workerPayroll';

export function useWorkerPayroll() {
  const [records, setRecords] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [overtime, setOvertime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const configured = isSupabaseConfigured();

  const runSync = useCallback(async (ctx) => {
    if (!configured) return { created: 0, updated: 0 };
    setSyncing(true);
    try {
      const result = await syncWorkerPayrollFromAttendance(ctx);
      setLastSync(result);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [configured]);

  const load = useCallback(async ({ skipSync = false } = {}) => {
    if (!configured) {
      setError('Supabase non configuré (.env)');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [workerRows, projectRows, attRows, otRows] = await Promise.all([
        listWorkers(),
        listProjects(),
        listAttendance().catch(() => []),
        listOvertime().catch(() => []),
      ]);

      let rows = await listWorkerPayroll();

      let syncResult = null;
      if (!skipSync) {
        syncResult = await runSync({
          attendance: attRows,
          workers: workerRows,
          overtime: otRows,
          projects: projectRows,
          existingRecords: rows,
        });
        if (syncResult.created > 0 || syncResult.updated > 0) {
          rows = await listWorkerPayroll();
        }
      }

      setRecords(rows);
      setWorkers(workerRows);
      setProjects(projectRows);
      setAttendance(attRows);
      setOvertime(otRows);
      return syncResult;
    } catch (err) {
      console.error('[CITYMO] useWorkerPayroll load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des paiements.'));
    } finally {
      setLoading(false);
    }
  }, [configured, runSync]);

  const syncFromPresence = useCallback(async () => {
    setError(null);
    try {
      const result = await load();
      return {
        success: true,
        created: result?.created ?? 0,
        updated: result?.updated ?? 0,
      };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur synchronisation présences.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const chantiers = useMemo(
    () => collectPayrollChantiers(projects, records),
    [projects, records],
  );

  const weeks = useMemo(() => collectPayrollWeeks(records), [records]);

  const workersByProject = useCallback(
    (projectId) => {
      if (!projectId) return [];
      return workers.filter((w) => String(w.project_id || '') === String(projectId));
    },
    [workers],
  );

  const workerOptions = useMemo(
    () => workers.map((w) => ({
      id: w.id,
      label: workerFullName(w),
      fonction: w.fonction || '',
      project_id: w.project_id || '',
    })).filter((o) => o.label),
    [workers],
  );

  const computeLineFromPresence = useCallback((worker, projectId, weekStart, projectName = '') => {
    const semaineFin = weekEndSunday(weekStart);
    const joursPaies = countWorkerPaidDaysFromRecords(
      attendance,
      worker.id,
      projectId,
      weekStart,
      semaineFin,
    );
    const ot = sumWorkerOvertimeFromRecords(
      overtime,
      worker.id,
      weekStart,
      semaineFin,
      projectName,
    );

    return buildWorkerPayrollLine(worker, {
      joursPaies: joursPaies > 0 ? joursPaies : '',
      heuresSup: ot.heures > 0 ? ot.heures : '',
      avgTarifSup: ot.avgTarif,
      fromPresence: joursPaies > 0,
    });
  }, [attendance, overtime]);

  const createBatch = useCallback(async (batchMeta, lines) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createWorkerPayrollBatch(batchMeta, lines);
      await load({ skipSync: true });
      return { success: true, count: created.length };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement paiement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const updateAdjustments = useCallback(async (id, existing, adjustments) => {
    setSaving(true);
    setError(null);
    try {
      await updateWorkerPayrollAdjustments(id, existing, adjustments);
      await load({ skipSync: true });
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification paiement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const markPaid = useCallback(async (id) => {
    setError(null);
    try {
      await updateWorkerPayrollStatut(id, 'Payé');
      await load({ skipSync: true });
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur validation paiement.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteWorkerPayroll(id);
      await load({ skipSync: true });
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    records,
    workers,
    projects,
    workerOptions,
    chantiers,
    weeks,
    workersByProject,
    computeLineFromPresence,
    groupPayrollByProjectWeek,
    loading,
    syncing,
    saving,
    error,
    configured,
    lastSync,
    load,
    syncFromPresence,
    createBatch,
    updateAdjustments,
    markPaid,
    remove,
    filterWorkerPayroll,
    computePayrollStats,
  };
}
