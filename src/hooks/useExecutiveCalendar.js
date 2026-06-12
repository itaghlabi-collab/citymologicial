import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import {
  canAccessExecutiveCalendar,
  canWriteExecutiveCalendar,
} from '../services/auth/executiveCalendarAccess';
import {
  listExecutiveEvents,
  createExecutiveEvent,
  updateExecutiveEvent,
  deleteExecutiveEvent,
  rescheduleExecutiveEvent,
  fetchPendingExecutiveNotifications,
  markExecutiveNotificationRead,
  computeClientSideAlerts,
  computeExecutiveKpis,
  exportExecutiveCalendarCsv,
  exportExecutiveCalendarExcel,
  exportExecutiveCalendarPdf,
  printExecutiveCalendar,
  eventDurationMs,
} from '../services/internal/executiveCalendar';

export function useExecutiveCalendar() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();
  const canAccess = canAccessExecutiveCalendar(user);
  const canWrite = canWriteExecutiveCalendar(user);
  const alertShownRef = useRef(new Set());

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY');
      setLoading(false);
      return;
    }
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!canAccessExecutiveCalendar(user)) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const events = await listExecutiveEvents();
      setRecords(events);
      try {
        const pending = await fetchPendingExecutiveNotifications();
        setNotifications(pending);
      } catch {
        setNotifications([]);
      }
    } catch (err) {
      console.error('[CITYMO] useExecutiveCalendar', err);
      setError(formatSupabaseError(err, 'Erreur chargement agenda de direction.'));
    } finally {
      setLoading(false);
    }
  }, [configured, authLoading, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured || !canAccess) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION', 'SIGNED_OUT'].includes(event)) {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, canAccess, load]);

  useEffect(() => {
    if (!canAccess || !records.length) return undefined;
    const tick = () => {
      const alerts = computeClientSideAlerts(records);
      alerts.forEach((a) => {
        if (alertShownRef.current.has(a.id)) return;
        alertShownRef.current.add(a.id);
        window.dispatchEvent(new CustomEvent('citymo:executive-alert', {
          detail: {
            title: `Agenda DG — ${a.label}`,
            message: `${a.event.title} — ${new Date(a.event.start_datetime).toLocaleString('fr-FR')}`,
            eventId: a.event.id,
          },
        }));
      });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [canAccess, records]);

  async function save(form, id) {
    if (!canWrite) return { success: false, error: 'Accès lecture seule.' };
    setSaving(true);
    setError(null);
    try {
      if (id) await updateExecutiveEvent(id, form);
      else await createExecutiveEvent(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function reschedule(id, newStartIso, event) {
    if (!canWrite) return { success: false, error: 'Accès lecture seule.' };
    setSaving(true);
    setError(null);
    try {
      await rescheduleExecutiveEvent(id, newStartIso, eventDurationMs(event));
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur déplacement événement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!canWrite) return { success: false, error: 'Accès lecture seule.' };
    setSaving(true);
    setError(null);
    try {
      await deleteExecutiveEvent(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function dismissNotification(id) {
    try {
      await markExecutiveNotificationRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('[CITYMO] dismissNotification', err);
    }
  }

  function kpis(refDate = new Date()) {
    return computeExecutiveKpis(records, refDate);
  }

  return {
    records,
    notifications,
    loading,
    saving,
    error,
    configured,
    canAccess,
    canWrite,
    reload: load,
    save,
    reschedule,
    remove,
    dismissNotification,
    kpis,
    exportCsv: exportExecutiveCalendarCsv,
    exportExcel: exportExecutiveCalendarExcel,
    exportPdf: exportExecutiveCalendarPdf,
    printAgenda: printExecutiveCalendar,
  };
}
