import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listDocumentShares,
  createDocumentShare,
  updateDocumentShare,
  deleteDocumentShare,
} from '../services/documents/documentShares';

export function useDocumentShares() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setShares([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listDocumentShares();
      setShares(rows);
    } catch (err) {
      console.error('[CITYMO] useDocumentShares', err);
      setError(formatSupabaseError(err, 'Erreur chargement des partages.'));
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  async function runAction(fn) {
    setSaving(true);
    setError(null);
    try {
      const result = await fn();
      await load();
      return { success: true, data: result };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur opération partage.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    shares,
    loading,
    saving,
    error,
    configured,
    reload: load,
    createShare: (payload) => runAction(() => createDocumentShare(payload)),
    updateShare: (id, form) => runAction(() => updateDocumentShare(id, form)),
    removeShare: (id) => runAction(() => deleteDocumentShare(id)),
  };
}
