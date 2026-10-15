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
import {
  listLibraryPlans,
  getLibraryPlan,
  createLibraryPlan,
  updateLibraryPlan,
  listProjectsForFabrication,
} from '../services/fabrication/fabricationLibrary';
import {
  listAtelierStaff,
  saveProduction as saveProductionService,
  recordProductionProgress,
  updateOperationStatut,
} from '../services/fabrication/fabricationProductions';

export function useFabrication() {
  const configured = isSupabaseConfigured();
  const [records, setRecords] = useState([]);
  const [library, setLibrary] = useState([]);
  const [users, setUsers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [projects, setProjects] = useState([]);
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
      const [rows, libRows, people, staffRows, projectRows] = await Promise.all([
        listFabricationPlans(),
        listLibraryPlans().catch((err) => {
          console.warn('[CITYMO] fabrication library', err.message);
          return [];
        }),
        listFabricationUsers().catch(() => []),
        listAtelierStaff().catch(() => []),
        listProjectsForFabrication().catch(() => []),
      ]);
      setRecords(rows);
      setLibrary(libRows);
      setUsers(people);
      setStaff(staffRows);
      setProjects(projectRows);
    } catch (err) {
      console.error('[CITYMO] fabrication load', err);
      setError(err.message || SCHEMA_HINT);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  const run = useCallback(async (fn, fallback) => {
    setSaving(true);
    setError('');
    try {
      const row = await fn();
      await load();
      return { success: true, row };
    } catch (err) {
      return { success: false, error: err.message || fallback };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const transmit = useCallback(
    (payload) => run(() => transmitFabricationPlan(payload), 'Erreur transmission.'),
    [run],
  );

  const assign = useCallback(
    (id, payload) => run(() => assignFabricationPlan(id, payload), 'Erreur affectation.'),
    [run],
  );

  const updateProduction = useCallback(
    (id, payload) => run(() => updateFabricationProduction(id, payload), 'Erreur mise à jour.'),
    [run],
  );

  const saveLibraryPlan = useCallback(
    (id, payload) => run(
      () => (id ? updateLibraryPlan(id, payload) : createLibraryPlan(payload)),
      'Erreur enregistrement du plan.',
    ),
    [run],
  );

  const saveProduction = useCallback(
    (payload, options) => run(() => saveProductionService(payload, options), 'Erreur enregistrement production.'),
    [run],
  );

  const recordProgress = useCallback(
    (id, payload) => run(() => recordProductionProgress(id, payload), 'Erreur mise à jour.'),
    [run],
  );

  const setOperationStatut = useCallback(
    (opId, statut) => run(() => updateOperationStatut(opId, statut), 'Erreur opération.'),
    [run],
  );

  const fetchOne = useCallback(async (id) => getFabricationPlan(id), []);
  const fetchLibraryPlan = useCallback(async (id) => getLibraryPlan(id), []);

  return {
    configured,
    records,
    library,
    users,
    staff,
    projects,
    loading,
    saving,
    error,
    load,
    transmit,
    assign,
    updateProduction,
    saveLibraryPlan,
    saveProduction,
    recordProgress,
    setOperationStatut,
    fetchOne,
    fetchLibraryPlan,
  };
}
