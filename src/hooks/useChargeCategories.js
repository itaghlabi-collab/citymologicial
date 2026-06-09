import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import {
  listChargeCategories,
  createChargeCategory,
  updateChargeCategory,
  deleteChargeCategory,
} from '../services/finance/chargeCategories';

export function useChargeCategories() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
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
    if (!user) {
      setError('Session non détectée — tentative de lecture quand même.');
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listChargeCategories());
    } catch (err) {
      console.error('[CITYMO] useChargeCategories', err);
      setError(formatSupabaseError(err, 'Erreur chargement catégories.'));
    } finally {
      setLoading(false);
    }
  }, [configured, authLoading, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      if (id) await updateChargeCategory(id, form);
      else await createChargeCategory(form);
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

  async function remove(id) {
    setSaving(true);
    try {
      await deleteChargeCategory(id);
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

  return { records, loading, saving, error, configured, reload: load, save, remove };
}
