/**
 * useWorkerPayroll.js — Paiement hebdomadaire ouvriers
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listWorkers } from '../services/rh/workers';
import { workerFullName } from '../services/rh/attendance';
import {
  listWorkerPayroll,
  createWorkerPayroll,
  updateWorkerPayroll,
  updateWorkerPayrollStatut,
  deleteWorkerPayroll,
  generateWorkerPayrollWeek,
  filterWorkerPayroll,
  computePayrollStats,
  collectPayrollChantiers,
  collectPayrollWeeks,
  weekStartMonday,
} from '../services/rh/workerPayroll';

export function useWorkerPayroll() {
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
        listWorkerPayroll(),
        listWorkers(),
      ]);
      setRecords(rows);
      setWorkers(workerRows);
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
    () => collectPayrollChantiers(workers, records),
    [workers, records],
  );

  const semaines = useMemo(
    () => collectPayrollWeeks(records),
    [records],
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
      await createWorkerPayroll(form);
      await load();
      return { success: true };
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
      await updateWorkerPayrollStatut(id, 'Paye');
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur validation paiement.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const markAllPaid = useCallback(async (ids) => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(ids.map((id) => updateWorkerPayrollStatut(id, 'Paye')));
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur validation des paiements.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
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

  const generateWeek = useCallback(async (semaineDebut) => {
    setSaving(true);
    setError(null);
    try {
      const start = semaineDebut || weekStartMonday(new Date().toISOString().slice(0, 10));
      await generateWorkerPayrollWeek(start);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur génération des paiements.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  return {
    records,
    workers,
    workerOptions,
    chantiers,
    semaines,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    markPaid,
    markAllPaid,
    remove,
    generateWeek,
    filterWorkerPayroll,
    computePayrollStats,
  };
}
