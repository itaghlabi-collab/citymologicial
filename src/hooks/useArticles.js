/**
 * useArticles.js — CRM Articles (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  duplicateArticle,
  backfillMissingArticleReferences,
  filterArticles,
  computeArticlesStats,
} from '../services/crm/articles';

export function useArticles() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré (.env)');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await backfillMissingArticleReferences().catch(() => {});
      const rows = await listArticles();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useArticles load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des articles.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const data = await createArticle(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement article.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const update = useCallback(async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      const data = await updateArticle(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification article.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteArticle(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const duplicate = useCallback(async (id) => {
    setError(null);
    try {
      await duplicateArticle(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur duplication.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    records,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    duplicate,
    filterArticles,
    computeArticlesStats,
  };
}
