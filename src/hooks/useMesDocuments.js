import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listFolders,
  listDocuments,
  getFolderBreadcrumb,
  createFolder,
  renameFolder,
  softDeleteFolder,
  uploadDocument,
  renameDocument,
  moveDocument,
  shareDocument,
  softDeleteDocument,
  listAllFoldersFlat,
  getMesDocumentsStats,
} from '../services/documents/mesDocuments';

export function useMesDocuments() {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [stats, setStats] = useState({ total: 0, recents: 0, partages: 0, totalSize: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [f, d, bc, af, st] = await Promise.all([
        listFolders(currentFolderId),
        listDocuments(currentFolderId, { search, department: filterDept }),
        currentFolderId ? getFolderBreadcrumb(currentFolderId) : Promise.resolve([]),
        listAllFoldersFlat(),
        getMesDocumentsStats(),
      ]);
      setFolders(f);
      setDocuments(d);
      setBreadcrumb(bc);
      setAllFolders(af);
      setStats(st);
    } catch (err) {
      console.error('[CITYMO] useMesDocuments', err);
      setError(formatSupabaseError(err, 'Erreur chargement documents.'));
    } finally {
      setLoading(false);
    }
  }, [configured, currentFolderId, search, filterDept]);

  useEffect(() => { load(); }, [load]);

  async function runAction(fn) {
    setSaving(true);
    setError(null);
    try {
      const result = await fn();
      await load();
      return { success: true, data: result };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur opération document.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    currentFolderId,
    setCurrentFolderId,
    folders,
    documents,
    breadcrumb,
    allFolders,
    stats,
    loading,
    saving,
    error,
    configured,
    search,
    setSearch,
    filterDept,
    setFilterDept,
    reload: load,
    createFolder: (payload) => runAction(() => createFolder(payload)),
    renameFolder: (id, name) => runAction(() => renameFolder(id, name)),
    removeFolder: (id) => runAction(() => softDeleteFolder(id)),
    uploadFiles: async (files, opts) => {
      setSaving(true);
      setError(null);
      try {
        for (const file of files) {
          await uploadDocument(file, { folderId: currentFolderId, ...opts });
        }
        await load();
        return { success: true };
      } catch (err) {
        const msg = formatSupabaseError(err, 'Erreur upload fichier.');
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setSaving(false);
      }
    },
    renameDoc: (id, name) => runAction(() => renameDocument(id, name)),
    moveDoc: (id, folderId) => runAction(() => moveDocument(id, folderId)),
    shareDoc: (id) => runAction(() => shareDocument(id)),
    removeDoc: (id) => runAction(() => softDeleteDocument(id)),
  };
}
