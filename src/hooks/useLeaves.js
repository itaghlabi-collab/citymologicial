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
  canManageLeaves as checkCanManageLeaves,
  canOverrideLeaveBalance as checkCanOverride,
} from '../services/auth/leaveAccess';
import {
  listLeaves,
  createLeave,
  updateLeave,
  updateLeaveStatut,
  approveLeaveWithBalance,
  cancelApprovedLeave,
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
  const [canManageLeaves, setCanManageLeaves] = useState(false);
  const [canOverrideBalance, setCanOverrideBalance] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ok, override] = await Promise.all([
        checkCanManageLeaves(user),
        checkCanOverride(user),
      ]);
      if (!cancelled) {
        setCanManageLeaves(ok);
        setCanOverrideBalance(override);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const myEmployee = useMemo(
    () => findEmployeeByEmail(employees, user?.email),
    [employees, user?.email],
  );

  const visibleLeaves = useMemo(() => {
    if (canManageLeaves) return leaves;
    return leaves.filter((l) => l.created_by === user?.id);
  }, [leaves, canManageLeaves, user?.id]);

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

  const buildMeta = useCallback((form, { jours, dateRetour, statut, fichierUrl, employeLabel }) => {
    const emp = employees.find((e) => e.id === form.employee_id);
    const fromForm = [form.prenom, form.nom].filter(Boolean).join(' ').trim();
    return {
      jours,
      dateRetour,
      employeLabel: employeLabel || fromForm || employeeFullName(emp),
      statut,
      fichierUrl: fichierUrl ?? null,
    };
  }, [employees]);

  const create = useCallback(async (form, { jours, dateRetour, fichierUrl, employeLabel }) => {
    if (!user?.id) {
      const msg = 'Session expirée. Reconnectez-vous.';
      setError(msg);
      return { success: false, error: msg };
    }

    setSaving(true);
    setError(null);
    try {
      await createLeave(form, buildMeta(form, { jours, dateRetour, fichierUrl, employeLabel }));
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

  const update = useCallback(async (id, form, { jours, dateRetour, statut, fichierUrl, employeLabel }) => {
    if (!user?.id) {
      const msg = 'Session expirée. Reconnectez-vous.';
      setError(msg);
      return { success: false, error: msg };
    }

    setSaving(true);
    setError(null);
    try {
      await updateLeave(id, form, buildMeta(form, { jours, dateRetour, statut, fichierUrl, employeLabel }));
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

  const approve = useCallback(async (id, { override = false, overrideReason = null } = {}) => {
    if (!canManageLeaves) {
      const msg = 'Seuls les responsables RH peuvent approuver une demande.';
      setError(msg);
      return { success: false, error: msg };
    }
    setError(null);
    try {
      const leave = leaves.find((l) => l.id === id);
      const employee = employees.find((e) => e.id === leave?.employee_id) || leave?.employees;
      await approveLeaveWithBalance(id, { override, overrideReason, employee });
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves approve', err);
      if (err?.code === 'BALANCE_EXCEEDED') {
        return { success: false, error: err.message, code: 'BALANCE_EXCEEDED', preview: err.preview };
      }
      const msg = formatSupabaseError(err, 'Erreur approbation.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load, canManageLeaves, leaves, employees]);

  const refuse = useCallback(async (id) => {
    if (!canManageLeaves) {
      const msg = 'Seuls les responsables RH peuvent refuser une demande.';
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
  }, [load, canManageLeaves]);

  const cancelApproved = useCallback(async (id) => {
    if (!canManageLeaves) {
      const msg = 'Seuls les responsables RH peuvent annuler une demande approuvée.';
      setError(msg);
      return { success: false, error: msg };
    }
    setError(null);
    try {
      await cancelApprovedLeave(id);
      await load();
      return { success: true };
    } catch (err) {
      console.error('[CITYMO] useLeaves cancel', err);
      const msg = formatSupabaseError(err, 'Erreur annulation.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load, canManageLeaves]);

  const permissions = useMemo(() => ({
    superAdmin,
    canManageLeaves,
    canOverrideBalance,
    canApproveRefuse: canManageLeaves,
    canEdit: (row) => canEditLeave(row, { userId: user?.id, canManageLeaves }),
    canDelete: (row) => canDeleteLeave(row, { userId: user?.id, canManageLeaves }),
  }), [superAdmin, canManageLeaves, canOverrideBalance, user?.id]);

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
    cancelApproved,
    permissions,
    user,
  };
}
