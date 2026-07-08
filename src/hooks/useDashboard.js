/**
 * useDashboard.js — Hook tableau de bord (chargement auto permanent + realtime)
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
  const loadInFlightRef = useRef(false);
  const dataRef = useRef(null);
  const loadRef = useRef(null);

  const flashUpdated = useCallback(() => {
    setJustUpdated(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setJustUpdated(false);
    }, 2500);
  }, []);

  const load = useCallback(async ({ silent = false, flash = false } = {}) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const payload = await loadDashboardData({ dateFrom, dateTo });
      if (!mountedRef.current) return;
      setData(payload);
      dataRef.current = payload;
      setLastUpdated(new Date());
      if (flash) flashUpdated();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Impossible de charger le tableau de bord.');
      if (!silent) setData(null);
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFrom, dateTo, flashUpdated]);

  loadRef.current = load;

  const reload = useCallback(() => {
    load({ silent: Boolean(dataRef.current) });
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    load({ silent: false });
    return () => {
      mountedRef.current = false;
      clearTimeout(flashTimerRef.current);
    };
  }, [load]);

  // Realtime + polling permanent
  useEffect(() => {
    const unsub = subscribeDashboardRealtime(() => {
      loadRef.current?.({ silent: true, flash: true });
    });
    return unsub;
  }, [dateFrom, dateTo]);

  // Rafraîchir dès le retour sur l'onglet / la fenêtre
  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState === 'visible') {
        loadRef.current?.({ silent: true, flash: true });
      }
    };
    document.addEventListener('visibilitychange', refreshNow);
    window.addEventListener('focus', refreshNow);
    return () => {
      document.removeEventListener('visibilitychange', refreshNow);
      window.removeEventListener('focus', refreshNow);
    };
  }, []);

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
