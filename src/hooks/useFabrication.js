import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  listFabricationPlans,
  getFabricationPlan,
  transmitFabricationPlan,
  assignFabricationPlan,
  updateFabricationProduction,
  listFabricationUsers,
  SCHEMA_HINT,
} from '../services/fabrication/fabricationPlans';

export function useFabrication() {
  const configured = isSupabaseConfigured();
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!configured) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [rows, people] = await Promise.all([
        listFabricationPlans(),
        listFabricationUsers().catch(() => []),
      ]);
      setRecords(rows);
      setUsers(people);
    } catch (err) {
      console.error('[CITYMO] fabrication load', err);
      setError(err.message || SCHEMA_HINT);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  const transmit = useCallback(async (payload) => {
    setSaving(true);
    setError('');
    try {
      const row = await transmitFabricationPlan(payload);
      await load();
      return { success: true, row };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur transmission.' };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const assign = useCallback(async (id, payload) => {
    setSaving(true);
    setError('');
    try {
      await assignFabricationPlan(id, payload);
      await load();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur affectation.' };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const updateProduction = useCallback(async (id, payload) => {
    setSaving(true);
    setError('');
    try {
      await updateFabricationProduction(id, payload);
      await load();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur mise à jour.' };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const fetchOne = useCallback(async (id) => getFabricationPlan(id), []);

  return {
    configured,
    records,
    users,
    loading,
    saving,
    error,
    load,
    transmit,
    assign,
    updateProduction,
    fetchOne,
  };
}
