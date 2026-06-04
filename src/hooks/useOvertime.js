/**
 * useOvertime.js — Heures supplémentaires (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listWorkers } from '../services/rh/workers';
import { workerFullName } from '../services/rh/attendance';
import {
  listOvertime,
  createOvertime,
  updateOvertime,
  deleteOvertime,
  filterOvertimeRecords,
  computeOvertimeStats,
  collectOvertimeChantiers,
} from '../services/rh/overtime';

export function useOvertime() {
  const [records, setRecords] = useState([]);
  const [workers, setWorkers] = useState([]);
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
      const [rows, workerRows] = await Promise.all([
        listOvertime(),
        listWorkers(),
      ]);
      setRecords(rows);
      setWorkers(workerRows);
    } catch (err) {
      console.error('[CITYMO] useOvertime load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des heures supplémentaires.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const chantiers = useMemo(
    () => collectOvertimeChantiers(workers, records),
    [workers, records],
  );

  const workerOptions = useMemo(
    () => workers.map((w) => ({
      id: w.id,
      label: workerFullName(w),
      chantier: w.chantier || '',
      tarif: w.tarif || 0,
    })).filter((o) => o.label),
    [workers],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createOvertime(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement heures sup.');
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
      await updateOvertime(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification heures sup.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteOvertime(id);
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
    workerOptions,
    chantiers,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterOvertimeRecords,
    computeOvertimeStats,
  };
}
