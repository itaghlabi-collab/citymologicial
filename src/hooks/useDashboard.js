/**
 * useDashboard.js — Hook tableau de bord (chargement auto permanent + realtime)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadDashboardData,
  subscribeDashboardRealtime,
  DASHBOARD_MIN_REFRESH_MS,
} from '../services/dashboard/dashboardService';
import { getSessionUser } from '../services/supabase/requireUser';

/** Cache mémoire par utilisateur + période — invalidé au changement de compte. */
const dashboardCache = new Map();
let lastSessionUserId = '';

function cacheKey(userId, dateFrom, dateTo) {
  return `${userId || 'anon'}|${dateFrom || ''}|${dateTo || ''}`;
}

function dropOtherUsers(userId) {
  const prefix = `${userId || 'anon'}|`;
  for (const key of dashboardCache.keys()) {
    if (!key.startsWith(prefix)) dashboardCache.delete(key);
  }
}

function peekCachedPayload(dateFrom, dateTo) {
  if (!lastSessionUserId) return null;
  return dashboardCache.get(cacheKey(lastSessionUserId, dateFrom, dateTo))?.payload || null;
}

export function useDashboard({ dateFrom, dateTo }) {
  const [data, setData] = useState(() => peekCachedPayload(dateFrom, dateTo));
  const [loading, setLoading] = useState(() => !peekCachedPayload(dateFrom, dateTo));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const mountedRef = useRef(true);
  const flashTimerRef = useRef(null);
  const loadInFlightRef = useRef(false);
  const dataRef = useRef(peekCachedPayload(dateFrom, dateTo));
  const loadRef = useRef(null);
  const lastLoadAtRef = useRef(0);
  const autoRefreshTimerRef = useRef(null);

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
    lastLoadAtRef.current = Date.now();

    let userId = '';
    try {
      userId = (await getSessionUser())?.id || '';
    } catch {
      userId = '';
    }
    lastSessionUserId = userId;
    dropOtherUsers(userId);
    const key = cacheKey(userId, dateFrom, dateTo);
    const cached = dashboardCache.get(key);
    if (cached?.payload && !dataRef.current) {
      setData(cached.payload);
      dataRef.current = cached.payload;
      if (cached.at) setLastUpdated(new Date(cached.at));
    }

    const showFullLoader = !silent && !dataRef.current;
    if (showFullLoader) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const payload = await loadDashboardData({ dateFrom, dateTo });
      if (!mountedRef.current) return;
      dashboardCache.set(key, { payload, at: Date.now() });
      setData(payload);
      dataRef.current = payload;
      setLastUpdated(new Date());
      if (flash) flashUpdated();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Impossible de charger le tableau de bord.');
      if (!silent && !dataRef.current) setData(null);
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

  // Rafraîchissement automatique : au plus un toutes les DASHBOARD_MIN_REFRESH_MS,
  // jamais quand l'onglet est caché (le retour sur l'onglet relance la demande).
  const requestAutoRefresh = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (autoRefreshTimerRef.current) return;
    const wait = Math.max(0, lastLoadAtRef.current + DASHBOARD_MIN_REFRESH_MS - Date.now());
    autoRefreshTimerRef.current = setTimeout(() => {
      autoRefreshTimerRef.current = null;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadRef.current?.({ silent: true, flash: true });
    }, wait);
  }, []);

  useEffect(() => () => {
    clearTimeout(autoRefreshTimerRef.current);
    autoRefreshTimerRef.current = null;
  }, []);

  // Realtime
  useEffect(() => {
    const unsub = subscribeDashboardRealtime(requestAutoRefresh);
    return unsub;
  }, [dateFrom, dateTo, requestAutoRefresh]);

  // Rafraîchir au retour sur l'onglet / la fenêtre (limité)
  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState === 'visible') requestAutoRefresh();
    };
    document.addEventListener('visibilitychange', refreshNow);
    window.addEventListener('focus', refreshNow);
    return () => {
      document.removeEventListener('visibilitychange', refreshNow);
      window.removeEventListener('focus', refreshNow);
    };
  }, [requestAutoRefresh]);

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
