/**
 * useEmployees.js — Reusable RH hook (list / CRUD / stats / filters).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  computeEmployeeStats,
  filterEmployees,
} from '../services/rh/employees';

export function useEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');

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
      const data = await listEmployees();
      setEmployees(data);
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur de chargement.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => computeEmployeeStats(employees), [employees]);

  const filtered = useMemo(
    () => filterEmployees(employees, { search, statut: statutFilter }),
    [employees, search, statutFilter],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createEmployee(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
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
      await updateEmployee(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteEmployee(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    employees,
    filtered,
    stats,
    loading,
    saving,
    error,
    configured,
    search,
    setSearch,
    statutFilter,
    setStatutFilter,
    load,
    create,
    update,
    remove,
  };
}
