/**
 * useLeaves.js — Congés (list / CRUD / filtres / permissions)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import { listEmployees } from '../services/rh/employees';
import { isSuperAdmin } from '../services/rh/isSuperAdmin';
import {
  listLeaves,
  createLeave,
  updateLeave,
  updateLeaveStatut,
  deleteLeave,
  computeLeaveStats,
  filterLeaves,
  employeeFullName,
  findEmployeeByEmail,
  canEditLeave,
  canDeleteLeave,
} from '../services/rh/leaves';

export function useLeaves() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const configured = isSupabaseConfigured();
  const superAdmin = isSuperAdmin(user);

  const myEmployee = useMemo(
    () => findEmployeeByEmail(employees, user?.email),
    [employees, user?.email],
  );

  const visibleLeaves = useMemo(() => {
    if (superAdmin) return leaves;
    return leaves.filter((l) => l.created_by === user?.id);
  }, [leaves, superAdmin, user?.id]);

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré (.env)');
      setLoading(false);
      return;
    }
    if (!user?.id) {
      setError('Session expirée. Reconnectez-vous.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [leaveRows, empRows] = await Promise.all([
        listLeaves(),
        listEmployees(),
      ]);
      setLeaves(leaveRows);
      setEmployees(empRows);
    } catch (err) {
      console.error('[CITYMO] useLeaves load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement.'));
    } finally {
      setLoading(false);
    }
  }, [configured, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => computeLeaveStats(visibleLeaves), [visibleLeaves]);

  const filtered = useMemo(
    () => filterLeaves(visibleLeaves, filter),
    [visibleLeaves, filter],
  );

  const buildMeta = useCallback((form, { jours, dateRetour, statut, fichierUrl }) => {
    const emp = employees.find((e) => e.id === form.employee_id);
    return {
      jours,
      dateRetour,
      employeLabel: employeeFullName(emp),
      statut,
      fichierUrl: fichierUrl ?? null,
    };
  }, [employees]);

  const create = useCallback(async (form, { jours, dateRetour, fichierUrl }) => {
    if (!user?.id) {
      const msg = 'Session expirée. Reconnectez-vous.';
      setError(msg);
      return { success: false, error: msg };
    }

    setSaving(true);
    setError(null);
    try {
      await createLeave(form, buildMeta(form, { jours, dateRetour, fichierUrl }));
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves create', err);
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load, buildMeta, user?.id]);

  const update = useCallback(async (id, form, { jours, dateRetour, statut, fichierUrl }) => {
    if (!user?.id) {
      const msg = 'Session expirée. Reconnectez-vous.';
      setError(msg);
      return { success: false, error: msg };
    }

    setSaving(true);
    setError(null);
    try {
      await updateLeave(id, form, buildMeta(form, { jours, dateRetour, statut, fichierUrl }));
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves update', err);
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load, buildMeta, user?.id]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteLeave(id);
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves remove', err);
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const approve = useCallback(async (id) => {
    if (!superAdmin) {
      const msg = 'Seul le Super Admin peut approuver une demande.';
      setError(msg);
      return { success: false, error: msg };
    }
    setError(null);
    try {
      await updateLeaveStatut(id, 'Approuve');
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves approve', err);
      const msg = formatSupabaseError(err, 'Erreur approbation.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load, superAdmin]);

  const refuse = useCallback(async (id) => {
    if (!superAdmin) {
      const msg = 'Seul le Super Admin peut refuser une demande.';
      setError(msg);
      return { success: false, error: msg };
    }
    setError(null);
    try {
      await updateLeaveStatut(id, 'Refuse');
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves refuse', err);
      const msg = formatSupabaseError(err, 'Erreur refus.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load, superAdmin]);

  const permissions = useMemo(() => ({
    superAdmin,
    canApproveRefuse: superAdmin,
    canEdit: (row) => canEditLeave(row, { userId: user?.id, superAdmin }),
    canDelete: (row) => canDeleteLeave(row, { userId: user?.id, superAdmin }),
  }), [superAdmin, user?.id]);

  return {
    leaves: visibleLeaves,
    allLeaves: leaves,
    employees,
    myEmployee,
    filtered,
    counts,
    loading,
    saving,
    error,
    configured,
    filter,
    setFilter,
    load,
    create,
    update,
    remove,
    approve,
    refuse,
    permissions,
    user,
  };
}
