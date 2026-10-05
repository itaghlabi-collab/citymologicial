/**
 * useSuiviTaches.js — Commercial / Marketing › Suivi des tâches (Kanban)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listTasks,
  createTask,
  updateTask,
  patchTask,
  deleteTask,
  listTaskAssignees,
  listTaskProjects,
  getCurrentUserId,
} from '../services/commercial/suiviTaches';

export function useSuiviTaches() {
  const [tasks, setTasks] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [userId, setUserId] = useState(null);
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
      const [rows, users, projs, uid] = await Promise.all([
        listTasks(),
        listTaskAssignees(),
        listTaskProjects(),
        getCurrentUserId(),
      ]);
      setTasks(rows);
      setAssignees(users);
      setProjects(projs);
      setUserId(uid);
    } catch (err) {
      console.error('[CITYMO] useSuiviTaches load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des tâches.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') load();
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const assigneeById = useMemo(() => {
    const m = new Map();
    assignees.forEach((u) => m.set(u.id, u));
    return m;
  }, [assignees]);

  const projectById = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const userLabel = useCallback((id) => (id ? assigneeById.get(id)?.nom || '—' : '—'), [assigneeById]);
  const projectLabel = useCallback((id) => (id ? projectById.get(id)?.label || '' : ''), [projectById]);

  const replaceTask = useCallback((task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }, []);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const minPos = tasks
        .filter((t) => t.statut === (form.statut || 'a_faire'))
        .reduce((m, t) => Math.min(m, t.position), 0);
      const created = await createTask(form, minPos - 1);
      setTasks((prev) => [created, ...prev]);
      return { success: true, data: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création de la tâche.');
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [tasks]);

  const update = useCallback(async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTask(id, form);
      replaceTask(updated);
      return { success: true, data: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification de la tâche.');
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [replaceTask]);

  /** Patch avec affichage immédiat, annulé si la base refuse. */
  const patch = useCallback(async (id, changes) => {
    const before = tasks.find((t) => t.id === id);
    if (!before) return { success: false, error: 'Tâche introuvable.' };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    try {
      const updated = await patchTask(id, changes);
      replaceTask(updated);
      return { success: true, data: updated };
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === id ? before : t)));
      const msg = formatSupabaseError(err, 'Modification refusée.');
      return { success: false, error: msg };
    }
  }, [tasks, replaceTask]);

  /** Glisser-déposer / changement de colonne : met à jour uniquement statut + position. */
  const moveTask = useCallback(async (id, statut, beforeId = null) => {
    const column = tasks
      .filter((t) => t.statut === statut && t.id !== id)
      .sort((a, b) => a.position - b.position);
    let position;
    if (!column.length) {
      position = 0;
    } else if (!beforeId) {
      position = column[column.length - 1].position + 1;
    } else {
      const idx = column.findIndex((t) => t.id === beforeId);
      if (idx <= 0) position = column[0].position - 1;
      else position = (column[idx - 1].position + column[idx].position) / 2;
    }
    const current = tasks.find((t) => t.id === id);
    if (current && current.statut === statut && current.position === position) {
      return { success: true, data: current };
    }
    return patch(id, { statut, position });
  }, [tasks, patch]);

  const remove = useCallback(async (id) => {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: formatSupabaseError(err, 'Erreur suppression.') };
    }
  }, []);

  return {
    tasks,
    assignees,
    projects,
    userId,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    patch,
    moveTask,
    remove,
    userLabel,
    projectLabel,
  };
}
