/**
 * useWorkerPayroll.js — Paiement ouvriers par projet
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listWorkers } from '../services/rh/workers';
import { workerFullName } from '../services/rh/attendance';
import { listProjects } from '../services/projects/projects';
import {
  listWorkerPayroll,
  createWorkerPayrollBatch,
  updateWorkerPayroll,
  updateWorkerPayrollStatut,
  deleteWorkerPayroll,
  filterWorkerPayroll,
  computePayrollStats,
  collectPayrollChantiers,
} from '../services/rh/workerPayroll';

export function useWorkerPayroll() {
  const [records, setRecords] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré (.env)');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rows, workerRows, projectRows] = await Promise.all([
        listWorkerPayroll(),
        listWorkers(),
        listProjects(),
      ]);
      setRecords(rows);
      setWorkers(workerRows);
      setProjects(projectRows);
    } catch (err) {
      console.error('[CITYMO] useWorkerPayroll load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des paiements.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const chantiers = useMemo(
    () => collectPayrollChantiers(projects, records),
    [projects, records],
  );

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

  const createBatch = useCallback(async (batchMeta, lines) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createWorkerPayrollBatch(batchMeta, lines);
      await load();
      return { success: true, count: created.length };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement paiement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const update = useCallback(async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      await updateWorkerPayroll(id, form);
      await load();
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
      await load();
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
      await load();
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
    workersByProject,
    loading,
    saving,
    error,
    configured,
    load,
    createBatch,
    update,
    markPaid,
    remove,
    filterWorkerPayroll,
    computePayrollStats,
  };
}
