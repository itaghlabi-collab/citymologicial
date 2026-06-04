/**
 * useCategories.js — CRM Catégories (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listCategories,
  createCategorie,
  updateCategorie,
  deleteCategorie,
  filterCategories,
  computeCategoriesStats,
} from '../services/crm/categories';
import { listArticles } from '../services/crm/articles';

export function useCategories() {
  const [records, setRecords] = useState([]);
  const [articles, setArticles] = useState([]);
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
      const [cats, arts] = await Promise.all([
        listCategories(),
        listArticles().catch(() => []),
      ]);
      setRecords(cats);
      setArticles(arts);
    } catch (err) {
      console.error('[CITYMO] useCategories load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des catégories.'));
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
      await createCategorie(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement catégorie.');
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
      await updateCategorie(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification catégorie.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteCategorie(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    records,
    articles,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterCategories,
    computeCategoriesStats,
  };
}
