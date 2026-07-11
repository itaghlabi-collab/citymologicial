/**
 * useProjectExpenses.js — Hook module Dépenses par projet
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { listProjects } from '../services/projects/projects';
import {
  listProjectExpenses,
  createProjectExpense,
  updateProjectExpense,
  deleteProjectExpense,
} from '../services/finance/projectExpenses';
import {
  buildProjectExpenseDashboard,
  buildProjectSummaries,
  fetchErpContextForProjects,
} from '../services/finance/projectExpenseData';
import {
  fetchLinkedChargesForProjects,
  mergeChargesIntoProjectExpenses,
} from '../services/finance/projectExpenseMerge';
import { isSupabaseConfigured } from '../lib/supabase';

function enrichExpensesWithProjects(expenses, projects) {
  const byId = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
  return (expenses || []).map((e) => {
    const p = e.project_id ? byId[String(e.project_id)] : null;
    if (!p) return e;
    return { ...e, project_nom: p.nom || e.project_nom || e.project_name_raw || '' };
  });
}

async function loadExpenseBundle() {
  const [projs, exps, ctx, charges] = await Promise.all([
    listProjects({ light: true }),
    listProjectExpenses(),
    fetchErpContextForProjects(),
    fetchLinkedChargesForProjects(),
  ]);
  const merged = mergeChargesIntoProjectExpenses(exps, charges, projs);
  return { projs, expenses: enrichExpensesWithProjects(merged, projs), ctx };
}

export function useProjectExpenses() {
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [erpContext, setErpContext] = useState({ orders: [], acquisitionOrders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const reload = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { projs, expenses: merged, ctx } = await loadExpenseBundle();
      setProjects(projs);
      setExpenses(merged);
      setErpContext(ctx);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    reload();
  }, [reload]);

  const dashboard = useMemo(
    () => buildProjectExpenseDashboard(
      expenses,
      projects,
      erpContext.orders,
      erpContext.acquisitionOrders,
    ),
    [expenses, projects, erpContext.orders, erpContext.acquisitionOrders],
  );

  const summaries = useMemo(
    () => buildProjectSummaries(
      projects,
      expenses,
      erpContext.orders,
      erpContext.acquisitionOrders,
    ),
    [projects, expenses, erpContext.orders, erpContext.acquisitionOrders],
  );

  const unmatched = useMemo(
    () => expenses.filter((e) => e.project_match_status === 'needs_manual'),
    [expenses],
  );

  return {
    configured,
    loading,
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
  };
}
