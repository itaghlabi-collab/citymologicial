import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listDocumentPublicLinks,
  createDocumentPublicLink,
  updateDocumentPublicLink,
  toggleDocumentPublicLink,
  deleteDocumentPublicLink,
} from '../services/documents/documentPublicLinks';

export function useDocumentPublicLinks() {
  const [liens, setLiens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setLiens([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listDocumentPublicLinks();
      setLiens(rows);
    } catch (err) {
      console.error('[CITYMO] useDocumentPublicLinks', err);
      setError(formatSupabaseError(err, 'Erreur chargement des liens publics.'));
      setLiens([]);
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
      const msg = formatSupabaseError(err, 'Erreur opération lien public.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    liens,
    loading,
    saving,
    error,
    configured,
    reload: load,
    createLink: (payload) => runAction(() => createDocumentPublicLink(payload)),
    updateLink: (id, form) => runAction(() => updateDocumentPublicLink(id, form)),
    toggleLink: (id, statut) => runAction(() => toggleDocumentPublicLink(id, statut)),
    removeLink: (id) => runAction(() => deleteDocumentPublicLink(id)),
  };
}
