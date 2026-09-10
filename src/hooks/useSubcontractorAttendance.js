import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listSubcontractors } from '../services/rh/subcontractors';
import { listProjectsForWorkerLink } from '../services/projects/projects';
import {
  listSubcontractorAttendance,
  saveSubcontractorAttendanceBatch,
  updateSubcontractorAttendance,
  deleteSubcontractorAttendance,
  listAttendanceForDateProject,
} from '../services/rh/subcontractorAttendance';
import { useAuth } from './useAuth';
import { isSuperAdmin } from '../services/rh/isSuperAdmin';
import { personNamesMatch, extractPersonNameFromStoredLabel } from '../services/rh/attendance';

function userNameAliases(user) {
  const raw = String(user?.nom || '').trim();
  if (!raw) return [];
  const aliases = [raw];
  const base = extractPersonNameFromStoredLabel(raw) || raw;
  if (base && !aliases.includes(base)) aliases.push(base);
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    if (!aliases.includes(reversed)) aliases.push(reversed);
  }
  return aliases;
}

function projectAssignedToUser(p, user) {
  if (!p || !user) return false;
  const aliases = userNameAliases(user);
  if (!aliases.length) return false;
  const fields = [p.chef_chantier, p.chef_projet, p.responsable];
  return aliases.some((alias) => fields.some((f) => f && personNamesMatch(f, alias)));
}

function isPresenceStPrivileged(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const role = String(user.role || '').toLowerCase().replace(/\s+/g, '_');
  return role.includes('rh')
    || role.includes('admin')
    || role === 'dg'
    || role.includes('directeur');
}

/** Chef de chantier / non privilégié : uniquement ses chantiers affectés. */
function filterProjectsForSession(projects, user) {
  const list = projects || [];
  if (!user || isPresenceStPrivileged(user)) return list;
  return list.filter((p) => projectAssignedToUser(p, user));
}

export function useSubcontractorAttendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const privileged = useMemo(() => isPresenceStPrivileged(user), [user]);
  const allowedProjectIds = useMemo(
    () => new Set((projects || []).map((p) => String(p.id))),
    [projects],
  );

  const loadMeta = useCallback(async () => {
    if (!configured) return;
    try {
      const [subs, projs] = await Promise.all([
        listSubcontractors(),
        listProjectsForWorkerLink(),
      ]);
      setSubcontractors((subs || []).filter((s) => s.statut === 'actif' || s.statut === 'suspendu'));
      setProjects(filterProjectsForSession(projs || [], user));
    } catch (err) {
      console.warn('[CITYMO] présence ST meta', err);
    }
  }, [configured, user]);

  const load = useCallback(async (filters = {}) => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let rows = await listSubcontractorAttendance(filters);
      // Session chef : ne pas exposer l’historique des autres chantiers
      if (!privileged && allowedProjectIds.size > 0) {
        rows = (rows || []).filter((r) => allowedProjectIds.has(String(r.project_id)));
      } else if (!privileged && allowedProjectIds.size === 0 && projects.length === 0) {
        // Meta pas encore chargée ou aucun chantier — ne pas afficher tout
        rows = [];
      }
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useSubcontractorAttendance', err);
      setError(formatSupabaseError(err, 'Erreur chargement présences sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [configured, privileged, allowedProjectIds, projects.length]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBatch(payload) {
    if (!privileged && payload?.projectId && !allowedProjectIds.has(String(payload.projectId))) {
      const msg = 'Chantier non autorisé pour votre session.';
      setError(msg);
      return { success: false, error: msg };
    }
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
    if (!privileged && projectId && !allowedProjectIds.has(String(projectId))) {
      return [];
    }
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
