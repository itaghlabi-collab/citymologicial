import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listSubcontractors } from '../services/rh/subcontractors';
import { listProjectsForSelect } from '../services/projects/projects';
import {
  listSubcontractorAttendance,
  saveSubcontractorAttendanceBatch,
  updateSubcontractorAttendance,
  deleteSubcontractorAttendance,
  listAttendanceForDateProject,
} from '../services/rh/subcontractorAttendance';

export function useSubcontractorAttendance() {
  const [records, setRecords] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const loadMeta = useCallback(async () => {
    if (!configured) return;
    try {
      const [subs, projs] = await Promise.all([
        listSubcontractors(),
        listProjectsForSelect(),
      ]);
      setSubcontractors((subs || []).filter((s) => s.statut === 'actif' || s.statut === 'suspendu'));
      setProjects(projs || []);
    } catch (err) {
      console.warn('[CITYMO] présence ST meta', err);
    }
  }, [configured]);

  const load = useCallback(async (filters = {}) => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listSubcontractorAttendance(filters));
    } catch (err) {
      console.error('[CITYMO] useSubcontractorAttendance', err);
      setError(formatSupabaseError(err, 'Erreur chargement présences sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
    loadMeta();
  }, [load, loadMeta]);

  async function saveBatch(payload) {
    setSaving(true);
    setError(null);
    try {
      const rows = await saveSubcontractorAttendanceBatch(payload);
      await load();
      return { success: true, records: rows };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement pointage.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function updateOne(id, patch) {
    setSaving(true);
    setError(null);
    try {
      await updateSubcontractorAttendance(id, patch);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur mise à jour.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    setError(null);
    try {
      await deleteSubcontractorAttendance(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function loadDay(date, projectId) {
    try {
      return await listAttendanceForDateProject(date, projectId);
    } catch (err) {
      console.warn('[CITYMO] loadDay présence ST', err);
      return [];
    }
  }

  return {
    records,
    subcontractors,
    projects,
    loading,
    saving,
    error,
    configured,
    reload: load,
    saveBatch,
    updateOne,
    remove,
    loadDay,
  };
}
