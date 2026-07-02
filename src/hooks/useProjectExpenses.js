/**
 * useProjectExpenses.js — Hook module Dépenses par projet
 */
import { useState, useEffect, useCallback } from 'react';
import { listProjects } from '../services/projects/projects';
import {
  listProjectExpenses,
  createProjectExpense,
  updateProjectExpense,
  deleteProjectExpense,
} from '../services/finance/projectExpenses';
import { syncProjectExpensesFromErp } from '../services/finance/projectExpenseSync';
import {
  buildProjectExpenseDashboard,
  buildProjectSummaries,
  fetchErpContextForProjects,
} from '../services/finance/projectExpenseData';
import { isSupabaseConfigured } from '../lib/supabase';

export function useProjectExpenses() {
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [erpContext, setErpContext] = useState({ orders: [], acquisitionOrders: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const reload = useCallback(async (withSync = true) => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (withSync) {
        setSyncing(true);
        await syncProjectExpensesFromErp().catch(() => {});
        setSyncing(false);
      }
      const [projs, exps, ctx] = await Promise.all([
        listProjects(),
        listProjectExpenses(),
        fetchErpContextForProjects(),
      ]);
      setProjects(projs);
      setExpenses(exps);
      setErpContext(ctx);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [configured]);

  useEffect(() => { reload(); }, [reload]);

  const dashboard = buildProjectExpenseDashboard(
    expenses,
    projects,
    erpContext.orders,
    erpContext.acquisitionOrders,
  );

  const summaries = buildProjectSummaries(
    projects,
    expenses,
    erpContext.orders,
    erpContext.acquisitionOrders,
  );

  const unmatched = expenses.filter((e) => e.project_match_status === 'needs_manual');

  return {
    configured,
    loading,
    syncing,
    error,
    projects,
    expenses,
    erpContext,
    dashboard,
    summaries,
    unmatched,
    reload,
    create: createProjectExpense,
    update: updateProjectExpense,
    remove: deleteProjectExpense,
    syncNow: async () => {
      setSyncing(true);
      await syncProjectExpensesFromErp();
      await reload(false);
      setSyncing(false);
    },
  };
}
