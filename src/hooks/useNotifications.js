/**
 * useNotifications.js — Hook centre de notifications (poll 10s + realtime ciblé)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notifications/notifications';
import { playNotificationSound } from '../utils/notificationSound';
import { logNotificationDebug } from '../services/notifications/notificationDebug';

const POLL_MS = 10_000;

function rowToNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type || 'system',
    priority: row.priority || 'normal',
    isRead: Boolean(row.is_read),
  };
}

export function useNotifications(user) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const knownIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);
  const soundEnabledRef = useRef(true);

  const playForNew = useCallback((notifications) => {
    if (!soundEnabledRef.current || !notifications?.length) return;
    const freshUnread = notifications.filter((n) => n && !n.isRead);
    if (freshUnread.length > 0) {
      playNotificationSound();
      logNotificationDebug('sound.play', { count: freshUnread.length });
    }
  }, []);

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

  useEffect(() => {
    initialLoadRef.current = true;
    knownIdsRef.current = new Set();
    load();
  }, [load]);

  useEffect(() => {
    if (!configured || !user?.id) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [configured, user?.id, load]);

  useEffect(() => {
    if (!configured || !user?.id) return undefined;
    const channel = getSupabase()
      .channel(`notifications-${user.id}`)
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
          if (incoming && !incoming.isRead && !knownIdsRef.current.has(incoming.id)) {
            playForNew([incoming]);
          }
          load();
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
            playForNew([incoming]);
          }
          load();
        },
      )
      .subscribe();
    return () => { getSupabase().removeChannel(channel); };
  }, [configured, user?.id, load, playForNew]);

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
