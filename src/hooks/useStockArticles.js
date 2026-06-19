import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import {
  listStockArticles,
  createStockArticle,
  updateStockArticle,
  archiveStockArticle,
  deleteStockArticle,
  listMovementsForArticle,
} from '../services/inventaire/stockArticles';

export function useStockArticles() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const configured = isSupabaseConfigured();

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
      setRecords(await listStockArticles());
    } catch (err) {
      console.error('[CITYMO] useStockArticles', err);
      setError(formatSupabaseError(err, 'Erreur chargement articles de stock.'));
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
      if (id) await updateStockArticle(id, form);
      else await createStockArticle(form);
      await load();
      setSuccess(id ? 'Article modifié avec succès.' : 'Article créé avec succès.');
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement article.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function archive(id) {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      await archiveStockArticle(id);
      await load();
      setSuccess('Article archivé.');
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur archivage.');
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
      await deleteStockArticle(id);
      await load();
      setSuccess('Article supprimé.');
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function getMovements(articleId) {
    try {
      return await listMovementsForArticle(articleId);
    } catch (err) {
      console.error('[CITYMO] getMovements', err);
      return [];
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
    archive,
    remove,
    getMovements,
  };
}
