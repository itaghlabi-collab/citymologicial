/**
 * useAttendance.js — Présence ouvriers (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listWorkers } from '../services/rh/workers';
import { listChefsChantier } from '../services/rh/employees';
import { listProjects } from '../services/projects/projects';
import {
  listAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  filterAttendanceRecords,
  computeAttendanceStats,
  collectProjectFilterOptions,
  filterWorkersForProject,
  workerFullName,
  buildAttendanceSheetGroups,
  pickSheetGroupForExport,
  findSheetGroupForRecord,
  sheetGroupLabel,
} from '../services/rh/attendance';

export function useAttendance() {
  const [records, setRecords] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [chefsChantier, setChefsChantier] = useState([]);
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
      const [rows, workerRows, projectRows, chefRows] = await Promise.all([
        listAttendance(),
        listWorkers(),
        listProjects().catch(() => []),
        listChefsChantier().catch((err) => {
          console.warn('[CITYMO] listChefsChantier', err);
          return [];
        }),
      ]);
      setRecords(rows);
      setWorkers(workerRows);
      setProjects(projectRows);
      setChefsChantier(chefRows);
    } catch (err) {
      console.error('[CITYMO] useAttendance load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des présences.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const projectOptions = useMemo(
    () => collectProjectFilterOptions(projects, workers, records),
    [projects, workers, records],
  );

  const workerOptions = useMemo(
    () => workers.map((w) => ({
      id: w.id,
      label: workerFullName(w),
      project_id: w.project_id || '',
      projet_nom: w.projet_nom || w.chantier || '',
    })).filter((o) => o.label),
    [workers],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createAttendance(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement présence.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const createBulk = useCallback(async (forms) => {
    setSaving(true);
    setError(null);
    let created = 0;
    const errors = [];
    try {
      for (const form of forms) {
        try {
          await createAttendance(form);
          created += 1;
        } catch (err) {
          errors.push(formatSupabaseError(err, 'Erreur sur un ouvrier.'));
        }
      }
      await load();
      if (created === 0) {
        const msg = errors[0] || 'Aucune présence enregistrée.';
        setError(msg);
        return { success: false, error: msg, created: 0 };
      }
      return { success: true, created, failed: forms.length - created, errors };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement présences.');
      setError(msg);
      return { success: false, error: msg, created };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const update = useCallback(async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      await updateAttendance(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification présence.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteAttendance(id);
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
    chefsChantier,
    workerOptions,
    projectOptions,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    createBulk,
    update,
    remove,
    filterAttendanceRecords,
    computeAttendanceStats,
    filterWorkersForProject,
    buildAttendanceSheetGroups,
    pickSheetGroupForExport,
    findSheetGroupForRecord,
    sheetGroupLabel,
  };
}
