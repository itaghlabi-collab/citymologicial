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
import { playNotificationSound } from '../utils/notificationSound';
import { logNotificationDebug } from '../services/notifications/notificationDebug';

const POLL_MS = 1_500;
const POLL_HIDDEN_MS = 15_000;

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
  const soundEnabledRef = useRef(true);
  const realtimeOkRef = useRef(false);
  const loadRef = useRef(null);
  const syncTimerRef = useRef(null);

  const playForNew = useCallback((notifications) => {
    if (!soundEnabledRef.current || !notifications?.length) return;
    const freshUnread = notifications.filter((n) => n && !n.isRead);
    if (freshUnread.length > 0) {
      playNotificationSound();
      logNotificationDebug('sound.play', { count: freshUnread.length, ids: freshUnread.map((n) => n.id) });
    }
  }, []);

  const announceUnread = useCallback((notifications) => {
    const fresh = (notifications || []).filter(
      (n) => n?.id && !n.isRead && !announcedIdsRef.current.has(n.id),
    );
    if (!fresh.length) return;
    fresh.forEach((n) => announcedIdsRef.current.add(n.id));
    playForNew(fresh);
  }, [playForNew]);

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
    logNotificationDebug('session', { currentUserId: userId, email: user.email });
    try {
      const [list, unread] = await Promise.all([
        listNotificationsForUser(user),
        countUnreadNotifications(user),
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
      setLoading(false);
    }
  }, [configured, userId, user, announceUnread]);

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

    const tick = () => {
      if (!isDocumentVisible()) return;
      loadRef.current?.();
    };

    const schedule = () => (isDocumentVisible() ? POLL_MS : POLL_HIDDEN_MS);

    let timer = null;
    const loop = () => {
      tick();
      timer = setTimeout(loop, schedule());
    };
    timer = setTimeout(loop, schedule());

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadRef.current?.();
      }
    };
    const onFocus = () => { loadRef.current?.(); };

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

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .from('profiles')
      .select('notification_sound_enabled')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        soundEnabledRef.current = data?.notification_sound_enabled !== false;
      })
      .catch(() => {});
  }, [userId]);

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead(user);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })));
    setUnreadCount(0);
  }, [user]);

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
