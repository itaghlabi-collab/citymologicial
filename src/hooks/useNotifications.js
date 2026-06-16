/**
 * useNotifications.js — Hook centre de notifications (poll 30s + realtime)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notifications/notifications';

const POLL_MS = 30_000;

export function useNotifications(user) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured || !user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const list = await listNotificationsForUser(user);
      setItems(list);
    } catch (err) {
      console.warn('[CITYMO] useNotifications load', err);
    } finally {
      setLoading(false);
    }
  }, [configured, user]);

  useEffect(() => {
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
        { event: '*', schema: 'public', table: 'notifications' },
        () => { load(); },
      )
      .subscribe();
    return () => { getSupabase().removeChannel(channel); };
  }, [configured, user?.id, load]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.isRead).length,
    [items],
  );

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead(user);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })));
  }, [user]);

  return {
    items,
    unreadCount,
    loading,
    configured,
    reload: load,
    markRead,
    markAllRead,
  };
}
