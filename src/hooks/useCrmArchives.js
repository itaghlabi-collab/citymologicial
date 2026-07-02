import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  listCrmArchives,
  uploadAndAnalyzeArchives,
  updateCrmArchive,
  validateCrmArchiveImport,
  deleteCrmArchive,
  reanalyzeCrmArchive,
  filterCrmArchives,
  sortCrmArchives,
  checkArchiveDuplicate,
} from '../services/crm/crmArchives';
import { listClients } from '../services/crm/clients';
import { matchClientForArchive, resolveArchiveStatutAfterMatch } from '../services/crm/crmArchiveMatch';

export function useCrmArchives() {
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [rows, cls] = await Promise.all([listCrmArchives(), listClients()]);
      setRecords(rows);
      setClients(cls);
    } catch (err) {
      setError(err.message || 'Erreur chargement archives.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  async function upload(files) {
    setSaving(true);
    try {
      const results = await uploadAndAnalyzeArchives(files, clients);
      await load();
      return results;
    } finally {
      setSaving(false);
    }
  }

  async function update(id, patch) {
    setSaving(true);
    try {
      const row = await updateCrmArchive(id, patch);
      setRecords((prev) => prev.map((r) => (r.id === id ? row : r)));
      return { success: true, data: row };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }

  async function assignClient(id, clientId) {
    const client = clients.find((c) => String(c.id) === String(clientId));
    const archive = records.find((r) => r.id === id);
    if (!archive) return { success: false, error: 'Archive introuvable.' };

    const match = client
      ? { client, confidence: 'manual', label: [client.prenom, client.nom].filter(Boolean).join(' ') }
      : { client: null, confidence: 'none', label: 'Client à associer manuellement' };

    let statut = resolveArchiveStatutAfterMatch(
      archive.statut === 'doublon' ? 'doublon' : 'client_a_verifier',
      match,
    );
    if (client) {
      const dup = await checkArchiveDuplicate(archive.reference, archive.doc_type, id);
      statut = dup ? 'doublon' : (archive.statut === 'erreur_lecture' ? 'erreur_lecture' : 'pret_import');
    } else {
      statut = 'client_a_verifier';
    }

    return update(id, {
      client_id: clientId || null,
      match_confidence: client ? 'manual' : 'none',
      statut,
      duplicate_ref: statut === 'doublon' ? archive.reference : null,
    });
  }

  async function changeDocType(id, docType) {
    const archive = records.find((r) => r.id === id);
    if (!archive) return { success: false, error: 'Archive introuvable.' };
    const dup = await checkArchiveDuplicate(archive.reference, docType, id);
    return update(id, {
      doc_type: docType,
      statut: dup ? 'doublon' : (archive.statut === 'importe' ? 'importe' : archive.statut),
      duplicate_ref: dup ? archive.reference : null,
    });
  }

  async function validateImport(id) {
    setSaving(true);
    try {
      const row = await validateCrmArchiveImport(id, clients);
      setRecords((prev) => prev.map((r) => (r.id === id ? row : r)));
      return { success: true, data: row };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    try {
      await deleteCrmArchive(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }

  async function reanalyze(id) {
    setSaving(true);
    try {
      const row = await reanalyzeCrmArchive(id, clients);
      setRecords((prev) => prev.map((r) => (r.id === id ? row : r)));
      return { success: true, data: row };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }

  return {
    records,
    clients,
    loading,
    saving,
    error,
    configured,
    load,
    upload,
    update,
    assignClient,
    changeDocType,
    validateImport,
    remove,
    reanalyze,
    filterCrmArchives,
    sortCrmArchives,
  };
}
