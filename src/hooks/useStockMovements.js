import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import {
  listStockMovements,
  createStockMovement,
  updateStockMovement,
  deleteStockMovement,
} from '../services/inventaire/stockMovements';
import { listStockArticles } from '../services/inventaire/stockArticles';

export function useStockMovements({ onArticlesChange } = {}) {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const configured = isSupabaseConfigured();

  const refreshArticles = useCallback(async () => {
    if (!onArticlesChange) return;
    try {
      const rows = await listStockArticles();
      onArticlesChange(rows || []);
    } catch (err) {
      console.warn('[CITYMO] refreshArticles after movement', err);
    }
  }, [onArticlesChange]);

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
    setLoading(true);
    setError(null);
    try {
      const rows = await listStockMovements();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useStockMovements', err);
      setError(formatSupabaseError(err, 'Erreur chargement des bons de mouvement.'));
    } finally {
      setLoading(false);
    }
  }, [configured, authLoading, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION', 'SIGNED_OUT'].includes(event)) {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      if (id) await updateStockMovement(id, form);
      else await createStockMovement(form);
      await load();
      await refreshArticles();
      setSuccess(id ? 'Bon de mouvement modifié.' : 'Bon de mouvement créé.');
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement du mouvement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      await deleteStockMovement(id);
      await load();
      await refreshArticles();
      setSuccess('Bon de mouvement supprimé.');
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression du mouvement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    records,
    loading,
    saving,
    error,
    success,
    configured,
    reload: load,
    save,
    remove,
  };
}
