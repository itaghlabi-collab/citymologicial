/**
 * useDashboard.js — Hook tableau de bord (chargement + realtime + dernière MAJ)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { loadDashboardData, subscribeDashboardRealtime } from '../services/dashboard/dashboardService';

export function useDashboard({ dateFrom, dateTo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const mountedRef = useRef(true);
  const flashTimerRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const payload = await loadDashboardData({ dateFrom, dateTo });
      if (!mountedRef.current) return;
      setData(payload);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Impossible de charger le tableau de bord.');
      if (!silent) setData(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFrom, dateTo]);

  const reload = useCallback(() => load({ silent: Boolean(data) }), [load, data]);

  const flashUpdated = useCallback(() => {
    setJustUpdated(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setJustUpdated(false);
    }, 2500);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      clearTimeout(flashTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    const unsub = subscribeDashboardRealtime(() => {
      load({ silent: true }).then(() => flashUpdated());
    });
    return unsub;
  }, [load, flashUpdated]);

  return {
    data,
    loading,
    refreshing,
    error,
    lastUpdated,
    justUpdated,
    reload,
  };
}
