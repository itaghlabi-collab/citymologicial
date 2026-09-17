import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { parseScannedArticleCode } from '../services/inventaire/barcodeUtils';
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
import { subscribeStockChanged } from '../services/inventaire/stockSync';
import { invalidateStockReadCaches } from '../services/inventaire/stockReadCache';
import { formatSupabaseError } from '../services/supabase/formatError';

export function useStockArticles() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const configured = isSupabaseConfigured();

  const load = useCallback(async (opts = {}) => {
    const force = opts.force === true;
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY');
      setLoading(false);
      return;
    }
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!force) setLoading(true);
    setError(null);
    try {
      const rows = await listStockArticles({
        force,
        onCatalogReady: (partial) => {
          if (Array.isArray(partial)) {
            setRecords(partial);
            setLoading(false);
          }
        },
      });
      setRecords(rows);
      if (!rows.length) {
        const seedRes = await seedStockArticlesIfEmpty().catch((err) => ({ error: err }));
        if (seedRes?.error) {
          console.warn('[CITYMO] seedStockArticlesIfEmpty', seedRes.error);
          setError(formatSupabaseError(
            seedRes.error,
            'Import automatique impossible — connectez-vous ou exécutez SEED_STOCK_ARTICLES_43.sql dans Supabase.',
          ));
        } else if (seedRes?.seeded > 0) {
          const refreshed = await listStockArticles({ force: true });
          setRecords(refreshed);
          setSuccess(`${seedRes.seeded} articles du catalogue importés.`);
        }
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
    return subscribeStockChanged(() => { load({ force: true }); });
  }, [configured, load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        invalidateStockReadCaches();
      }
      if (['SIGNED_IN', 'INITIAL_SESSION', 'SIGNED_OUT'].includes(event)) {
        load({ force: event === 'SIGNED_IN' || event === 'SIGNED_OUT' });
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

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
      const article = id
        ? await updateStockArticle(id, form)
        : await createStockArticle(form);
      await load({ force: true });
      setSuccess(id ? 'Article modifié avec succès.' : 'Article créé avec succès.');
      return { success: true, article };
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
      await load({ force: true });
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

  async function remove(id, options = {}) {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      await deleteStockArticle(id, options);
      await load({ force: true });
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
    return listMovementsForArticle(articleId);
  }, []);

  async function importCatalog() {
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      const res = await importStockArticlesCatalog();
      await load({ force: true });
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
      await load({ force: true });
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
      const article = await findStockArticleByBarcode(parseScannedArticleCode(code), localArticles);
      if (!article) {
        return { article: null, error: 'Aucun article trouvé pour ce code.' };
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
    reload: () => load({ force: true }),
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
