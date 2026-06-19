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
  seedStockArticlesIfEmpty,
  importStockArticlesCatalog,
  dedupeStockArticles,
  findStockArticleDuplicates,
  findStockArticleByBarcode,
  recordStockArticleScan,
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
      const seedRes = await seedStockArticlesIfEmpty().catch((err) => ({ error: err }));
      if (seedRes?.error) {
        console.warn('[CITYMO] seedStockArticlesIfEmpty', seedRes.error);
      } else if (seedRes?.seeded > 0) {
        setSuccess(`${seedRes.seeded} articles du catalogue importés.`);
      }
      const rows = await listStockArticles();
      setRecords(rows);
      if (seedRes?.error && !rows.length) {
        setError(formatSupabaseError(
          seedRes.error,
          'Import automatique impossible — connectez-vous ou exécutez SEED_STOCK_ARTICLES_43.sql dans Supabase.',
        ));
      }
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

  const fetchMovements = useCallback(async (articleId) => {
    try {
      return await listMovementsForArticle(articleId);
    } catch (err) {
      console.error('[CITYMO] getMovements', err);
      return [];
    }
  }, []);

  async function importCatalog() {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      const res = await importStockArticlesCatalog();
      await load();
      if (res.seeded > 0) {
        setSuccess(`${res.seeded} articles importés depuis le catalogue.`);
      } else {
        setSuccess('Le catalogue est déjà importé.');
      }
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Import catalogue impossible.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function removeDuplicates() {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      const res = await dedupeStockArticles();
      await load();
      if (res.removed > 0) {
        setSuccess(`${res.removed} doublon(s) supprimé(s).`);
      } else {
        setSuccess('Aucun doublon détecté.');
      }
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur lors du dédoublonnage.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function lookupByBarcode(code, localArticles = records) {
    setError(null);
    try {
      const article = await findStockArticleByBarcode(code, localArticles);
      if (!article) {
        return { article: null, error: `Aucun article trouvé pour le code « ${code} ».` };
      }
      await recordStockArticleScan(article.id);
      return { article, error: null };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur recherche code-barres.');
      setError(msg);
      return { article: null, error: msg };
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
    getMovements: fetchMovements,
    importCatalog,
    removeDuplicates,
    findDuplicates: findStockArticleDuplicates,
    lookupByBarcode,
  };
}
