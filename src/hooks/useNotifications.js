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

const POLL_FAST_MS = 2_500;
const POLL_SLOW_MS = 8_000;
const POLL_HIDDEN_MS = 15_000;

function rowToNotification(row) {
  return normalizeNotification(row);
}

function isDocumentVisible() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function useNotifications(user) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const knownIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const realtimeOkRef = useRef(false);
  const loadRef = useRef(null);

  const playForNew = useCallback((notifications) => {
    if (!soundEnabledRef.current || !notifications?.length) return;
    const freshUnread = notifications.filter((n) => n && !n.isRead);
    if (freshUnread.length > 0) {
      playNotificationSound().catch(() => {});
      logNotificationDebug('sound.play', { count: freshUnread.length });
    }
  }, []);

  const applyIncoming = useCallback((incoming, { playSound = true } = {}) => {
    if (!incoming?.id || incoming.isRead) return;
    const isNew = !knownIdsRef.current.has(incoming.id);
    if (!isNew) return;

    knownIdsRef.current.add(incoming.id);
    setItems((prev) => {
      if (prev.some((n) => n.id === incoming.id)) return prev;
      return [incoming, ...prev].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      );
    });
    setUnreadCount((c) => c + 1);
    if (playSound) playForNew([incoming]);
    logNotificationDebug('realtime.incoming', {
      id: incoming.id,
      title: incoming.title,
      userId: user?.id,
    });
  }, [playForNew, user?.id]);

  const load = useCallback(async () => {
    if (!configured || !user?.id) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    logNotificationDebug('session', { currentUserId: user.id, email: user.email });
    try {
      const [list, unread] = await Promise.all([
        listNotificationsForUser(user),
        countUnreadNotifications(user),
      ]);

      if (!initialLoadRef.current) {
        const newUnread = list.filter(
          (n) => !n.isRead && !knownIdsRef.current.has(n.id),
        );
        playForNew(newUnread);
      }

      knownIdsRef.current = new Set(list.map((n) => n.id));
      initialLoadRef.current = false;
      setItems(list);
      setUnreadCount(unread);
    } catch (err) {
      console.warn('[CITYMO] useNotifications load', err);
    } finally {
      setLoading(false);
    }
  }, [configured, user, playForNew]);

  loadRef.current = load;

  useEffect(() => {
    initialLoadRef.current = true;
    knownIdsRef.current = new Set();
    realtimeOkRef.current = false;
    load();
  }, [load]);

  useEffect(() => {
    if (!configured || !user?.id) return undefined;

    const tick = () => {
      if (!isDocumentVisible()) return;
      loadRef.current?.();
    };

    const schedule = () => {
      if (!isDocumentVisible()) return POLL_HIDDEN_MS;
      return realtimeOkRef.current ? POLL_SLOW_MS : POLL_FAST_MS;
    };

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
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [configured, user?.id]);

  useEffect(() => {
    if (!configured || !user?.id) return undefined;

    const channelName = `notifications-${user.id}`;
    const sb = getSupabase();
    const channel = sb
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const incoming = rowToNotification(payload.new);
          applyIncoming(incoming);
          loadRef.current?.();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const incoming = rowToNotification(payload.new);
          const wasRead = Boolean(payload.old?.is_read);
          if (incoming && !incoming.isRead && wasRead) {
            applyIncoming(incoming);
          }
          loadRef.current?.();
        },
      )
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        realtimeOkRef.current = ok;
        logNotificationDebug('realtime.status', { status, userId: user.id, ok });
        if (!ok && status !== 'SUBSCRIBED') {
          loadRef.current?.();
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [configured, user?.id, applyIncoming]);

  useEffect(() => {
    if (!user?.id) return;
    getSupabase()
      .from('profiles')
      .select('notification_sound_enabled')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        soundEnabledRef.current = data?.notification_sound_enabled !== false;
      })
      .catch(() => {});
  }, [user?.id]);

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
