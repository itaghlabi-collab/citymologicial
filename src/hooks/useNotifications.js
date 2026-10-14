/**
 * useNotifications.js — Hook centre de notifications (realtime + poll adaptatif)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  normalizeNotification,
} from '../services/notifications/notifications';
import { logNotificationDebug } from '../services/notifications/notificationDebug';

/** Le realtime livre les notifications instantanément ; le poll n'est qu'un filet de sécurité. */
const POLL_MS = 30_000;
/** Realtime indisponible : poll plus fréquent pour rester réactif. */
const POLL_NO_REALTIME_MS = 10_000;
/** Retour onglet / focus : pas de rechargement si le dernier date de moins de ça. */
const REFRESH_ON_FOCUS_MIN_MS = 10_000;

function rowToNotification(row) {
  return normalizeNotification(row);
}

function isDocumentVisible() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function useNotifications(user) {
  const userId = user?.id;
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const knownIdsRef = useRef(new Set());
  const announcedIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);
  const realtimeOkRef = useRef(false);
  const loadRef = useRef(null);
  const syncTimerRef = useRef(null);
  const userRef = useRef(user);
  const lastLoadAtRef = useRef(0);
  const loadInFlightRef = useRef(false);
  userRef.current = user;

  const announceUnread = useCallback((notifications) => {
    const fresh = (notifications || []).filter(
      (n) => n?.id && !n.isRead && !announcedIdsRef.current.has(n.id),
    );
    if (!fresh.length) return;
    fresh.forEach((n) => announcedIdsRef.current.add(n.id));
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      loadRef.current?.();
    }, 400);
  }, []);

  const applyIncoming = useCallback((incoming) => {
    if (!incoming?.id || incoming.isRead) return;
    const isNew = !knownIdsRef.current.has(incoming.id);
    knownIdsRef.current.add(incoming.id);

    announceUnread([incoming]);

    if (isNew) {
      setItems((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev;
        return [incoming, ...prev].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
        );
      });
      setUnreadCount((c) => c + 1);
      logNotificationDebug('realtime.incoming', {
        id: incoming.id,
        title: incoming.title,
        userId,
      });
    }
  }, [announceUnread, userId]);

  const load = useCallback(async () => {
    if (!configured || !userId) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    // Base lente : ne jamais empiler les requêtes, attendre la fin de la précédente.
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const currentUser = userRef.current;
    lastLoadAtRef.current = Date.now();
    logNotificationDebug('session', { currentUserId: userId, email: currentUser?.email });
    try {
      const [list, unread] = await Promise.all([
        listNotificationsForUser(currentUser),
        countUnreadNotifications(currentUser),
      ]);

      if (initialLoadRef.current) {
        list.filter((n) => !n.isRead).forEach((n) => {
          announcedIdsRef.current.add(n.id);
        });
      } else {
        announceUnread(list);
      }

      list.forEach((n) => knownIdsRef.current.add(n.id));
      initialLoadRef.current = false;
      setItems(list);
      setUnreadCount(unread);
    } catch (err) {
      console.warn('[CITYMO] useNotifications load', err);
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [configured, userId, announceUnread]);

  loadRef.current = load;

  useEffect(() => {
    initialLoadRef.current = true;
    knownIdsRef.current = new Set();
    announcedIdsRef.current = new Set();
    realtimeOkRef.current = false;
  }, [userId, configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured || !userId) return undefined;

    const schedule = () => (realtimeOkRef.current ? POLL_MS : POLL_NO_REALTIME_MS);

    let timer = null;
    const loop = () => {
      // Onglet caché : aucune requête ; le retour sur l'onglet recharge.
      if (isDocumentVisible() && Date.now() - lastLoadAtRef.current >= schedule() - 500) {
        loadRef.current?.();
      }
      timer = setTimeout(loop, schedule());
    };
    timer = setTimeout(loop, schedule());

    const refreshIfStale = () => {
      if (!isDocumentVisible()) return;
      if (Date.now() - lastLoadAtRef.current < REFRESH_ON_FOCUS_MIN_MS) return;
      loadRef.current?.();
    };
    const onVisible = () => refreshIfStale();
    const onFocus = () => refreshIfStale();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [configured, userId]);

  useEffect(() => {
    if (!configured || !userId) return undefined;

    const channelName = `notifications-${userId}`;
    const sb = getSupabase();
    const channel = sb
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          applyIncoming(rowToNotification(payload.new));
          scheduleSync();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = rowToNotification(payload.new);
          if (incoming && !incoming.isRead) {
            applyIncoming(incoming);
          }
          scheduleSync();
        },
      )
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        realtimeOkRef.current = ok;
        logNotificationDebug('realtime.status', { status, userId, ok });
        if (!ok && status !== 'SUBSCRIBED') {
          loadRef.current?.();
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [configured, userId, applyIncoming, scheduleSync]);

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead(userRef.current);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  const displayUnreadCount = useMemo(() => unreadCount, [unreadCount]);

  return {
    items,
    unreadCount: displayUnreadCount,
    loading,
    configured,
    reload: load,
    markRead,
    markAllRead,
  };
}
