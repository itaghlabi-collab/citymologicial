/**
 * Hook Annuaire Corps de métier
 */
import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { isMissingTradeDirectorySchema } from '../services/exploitation/tradeDirectory/constants';
import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setProfileStatus,
  listMyFavoriteProfileIds,
  toggleFavoriteProfile,
} from '../services/exploitation/tradeDirectory';
import {
  listTrades,
  createTrade,
  updateTrade,
  removeOrDeactivateTrade,
} from '../services/exploitation/tradeDirectory/trades';

export function useTradeDirectory() {
  const configured = isSupabaseConfigured();
  const [items, setItems] = useState([]);
  const [trades, setTrades] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!configured) {
      setFavoriteIds(new Set());
      return;
    }
    try {
      const ids = await listMyFavoriteProfileIds();
      setFavoriteIds(new Set(ids));
    } catch {
      setFavoriteIds(new Set());
    }
  }, [configured]);

  const reload = useCallback(async () => {
    if (!configured) {
      setItems([]);
      setTrades([]);
      setLoading(false);
      setSchemaMissing(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [profiles, tradeList] = await Promise.all([
        listProfiles(),
        listTrades({ activeOnly: false, withUsage: true }),
      ]);
      setItems(profiles);
      setTrades(tradeList);
      setSchemaMissing(false);
      await loadFavorites();
    } catch (err) {
      if (err?.code === 'SCHEMA' || isMissingTradeDirectorySchema(err)) {
        setSchemaMissing(true);
        setItems([]);
        setTrades([]);
      } else {
        setError(err?.message || 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [configured, loadFavorites]);

  useEffect(() => { reload(); }, [reload]);

  async function saveProfile(form, editId = null) {
    setSaving(true);
    setError(null);
    try {
      if (editId) await updateProfile(editId, form);
      else await createProfile(form);
      await reload();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function removeProfile(id) {
    setSaving(true);
    setError(null);
    try {
      await deleteProfile(id);
      await reload();
    } catch (err) {
      setError(err?.message || 'Suppression impossible.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item) {
    const next = item.status === 'actif' ? 'inactif' : 'actif';
    setSaving(true);
    try {
      await setProfileStatus(item.id, next);
      await reload();
    } catch (err) {
      setError(err?.message || 'Mise à jour statut impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite(item) {
    const isFav = favoriteIds.has(item.id);
    try {
      await toggleFavoriteProfile(item.id, isFav);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Favori impossible.');
    }
  }

  async function saveTrade(form, editId = null) {
    setSaving(true);
    setError(null);
    try {
      if (editId) await updateTrade(editId, form);
      else await createTrade(form);
      await reload();
    } catch (err) {
      setError(err?.message || 'Corps de métier : enregistrement impossible.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function removeTrade(trade) {
    setSaving(true);
    setError(null);
    try {
      const res = await removeOrDeactivateTrade(trade.id);
      await reload();
      return res;
    } catch (err) {
      setError(err?.message || 'Corps de métier : suppression impossible.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return {
    configured,
    items,
    trades,
    favoriteIds,
    loading,
    saving,
    error,
    schemaMissing,
    setError,
    reload,
    saveProfile,
    removeProfile,
    toggleStatus,
    toggleFavorite,
    saveTrade,
    removeTrade,
  };
}
