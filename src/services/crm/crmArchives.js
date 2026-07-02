/**
 * crmArchives.js — CRUD archives PDF CRM (import legacy)
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import {
  uploadArchiveFile,
  deleteArchiveFile,
  moveArchiveFile,
  resolveArchiveFileUrl,
} from './crmArchiveStorage';
import { analyzeArchivePdf } from './crmPdfParser';
import { matchClientForArchive, resolveArchiveStatutAfterMatch } from './crmArchiveMatch';
import { listClients } from './clients';

const TABLE = 'crm_archives';

export const ARCHIVE_STATUTS = [
  'en_attente',
  'pret_import',
  'client_a_verifier',
  'doublon',
  'erreur_lecture',
  'importe',
];

export const ARCHIVE_STATUT_LABEL = {
  en_attente: 'En analyse',
  pret_import: 'Prêt à importer',
  client_a_verifier: 'Client à vérifier',
  doublon: 'Doublon détecté',
  erreur_lecture: 'Erreur lecture PDF',
  importe: 'Importé',
};

export const ARCHIVE_STATUT_BADGE = {
  en_attente: 'badge-grey',
  pret_import: 'badge-green',
  client_a_verifier: 'badge-orange',
  doublon: 'badge-red',
  erreur_lecture: 'badge-red',
  importe: 'badge-blue',
};

export function normalizeCrmArchive(row, client = null) {
  if (!row) return null;
  const c = client || row.clients;
  return {
    id: row.id,
    file_name: row.file_name,
    storage_path: row.storage_path,
    file_size: row.file_size,
    mime_type: row.mime_type,
    doc_type: row.doc_type,
    reference: row.reference,
    date_document: row.date_document,
    date_echeance: row.date_echeance,
    devis_reference: row.devis_reference,
    intitule: row.intitule,
    client_id: row.client_id,
    client_nom: c ? clientDisplayName(c) : (row.client_detected_name || 'Client à associer manuellement'),
    client_detected_name: row.client_detected_name,
    client_ice: row.client_ice,
    client_email: row.client_email,
    client_telephone: row.client_telephone,
    total_ht: row.total_ht,
    total_tva: row.total_tva,
    total_ttc: row.total_ttc,
    statut: row.statut,
    match_confidence: row.match_confidence,
    duplicate_ref: row.duplicate_ref,
    detection_errors: row.detection_errors,
    imported_at: row.imported_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    __isImportedArchive: row.statut === 'importe',
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export async function listCrmArchives(filters = {}) {
  await getAuthUserId();
  let q = getSupabase()
    .from(TABLE)
    .select('*, clients(id, nom, prenom, email, telephone, ice)')
    .order('date_document', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filters.statut) q = q.eq('statut', filters.statut);
  if (filters.doc_type) q = q.eq('doc_type', filters.doc_type);
  if (filters.client_id) q = q.eq('client_id', filters.client_id);
  if (filters.imported_only) q = q.eq('statut', 'importe');
  if (filters.pending_only) q = q.neq('statut', 'importe');

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => normalizeCrmArchive(r));
}

export async function listImportedCrmArchives(docType) {
  return listCrmArchives({ doc_type: docType, imported_only: true });
}

export async function listClientImportedArchives(clientId) {
  if (!clientId) return [];
  return listCrmArchives({ client_id: clientId, imported_only: true });
}

export async function checkArchiveDuplicate(reference, docType, excludeId = null) {
  if (!reference) return null;
  const ref = reference.trim();
  const sb = getSupabase();
  const type = docType === 'facture' ? 'facture' : 'devis';

  let archQ = sb.from(TABLE).select('id, reference, statut, doc_type').eq('reference', ref).eq('doc_type', type);
  if (excludeId) archQ = archQ.neq('id', excludeId);
  const { data: archRows } = await archQ;
  if ((archRows || []).some((r) => r.statut !== 'erreur_lecture')) {
    return { source: 'archives', reference: ref };
  }

  if (type === 'devis') {
    const { data: devis } = await sb.from('crm_devis').select('id, reference').eq('reference', ref).maybeSingle();
    if (devis) return { source: 'devis', reference: ref };
  }

  if (type === 'facture') {
    const { data: fac } = await sb.from('crm_factures').select('id, numero').eq('numero', ref).maybeSingle();
    if (fac) return { source: 'factures', reference: ref };
  }

  return null;
}

async function buildArchiveRowFromFile(file, clients) {
  const meta = await analyzeArchivePdf(file);
  const match = matchClientForArchive(meta, clients);
  let statut = resolveArchiveStatutAfterMatch(meta.statut, match);

  const dup = await checkArchiveDuplicate(meta.reference, meta.doc_type);
  if (dup) {
    statut = 'doublon';
  }

  return {
    meta,
    match,
    statut,
    duplicate_ref: dup?.reference || null,
    client_id: match.client?.id || null,
    match_confidence: match.confidence,
  };
}

export async function uploadAndAnalyzeArchives(files, clients = []) {
  const list = Array.from(files || []).filter(Boolean);
  const results = [];

  for (const file of list) {
    try {
      const storage_path = await uploadArchiveFile(file, { scope: 'staging' });
      const built = await buildArchiveRowFromFile(file, clients);
      const { meta, match, statut, duplicate_ref, client_id, match_confidence } = built;

      const row = {
        file_name: file.name,
        storage_path,
        file_size: file.size,
        mime_type: file.type || 'application/pdf',
        doc_type: meta.doc_type,
        reference: meta.reference,
        date_document: meta.date_document,
        date_echeance: meta.date_echeance,
        devis_reference: meta.devis_reference,
        intitule: meta.intitule,
        client_id,
        client_detected_name: meta.client_detected_name,
        client_ice: meta.client_ice,
        client_email: meta.client_email,
        client_telephone: meta.client_telephone,
        total_ht: meta.total_ht,
        total_tva: meta.total_tva,
        total_ttc: meta.total_ttc,
        statut,
        match_confidence,
        duplicate_ref,
        detection_errors: meta.detection_errors,
        extraction_snippet: meta.extraction_snippet,
      };

      const { data, error } = await getSupabase().from(TABLE).insert(row).select('*, clients(id, nom, prenom)').single();
      if (error) throw error;
      results.push({ success: true, data: normalizeCrmArchive(data) });
    } catch (err) {
      results.push({ success: false, fileName: file.name, error: err.message || 'Erreur import.' });
    }
  }

  return results;
}

export async function updateCrmArchive(id, patch) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*, clients(id, nom, prenom, email, telephone, ice)')
    .single();
  if (error) throw error;
  return normalizeCrmArchive(data);
}

export async function reanalyzeCrmArchive(id, clients = []) {
  const sb = getSupabase();
  const { data: row, error } = await sb.from(TABLE).select('*').eq('id', id).single();
  if (error || !row) throw new Error('Archive introuvable.');

  const { data: blob, error: dlErr } = await sb.storage.from('citymo-documents').download(row.storage_path);
  if (dlErr || !blob) throw new Error('Impossible de relire le PDF.');

  const file = new File([blob], row.file_name, { type: 'application/pdf' });
  const built = await buildArchiveRowFromFile(file, clients);

  return updateCrmArchive(id, {
    doc_type: built.meta.doc_type,
    reference: built.meta.reference,
    date_document: built.meta.date_document,
    date_echeance: built.meta.date_echeance,
    devis_reference: built.meta.devis_reference,
    intitule: built.meta.intitule,
    client_id: built.client_id,
    client_detected_name: built.meta.client_detected_name,
    client_ice: built.meta.client_ice,
    client_email: built.meta.client_email,
    client_telephone: built.meta.client_telephone,
    total_ht: built.meta.total_ht,
    total_tva: built.meta.total_tva,
    total_ttc: built.meta.total_ttc,
    statut: built.statut,
    match_confidence: built.match_confidence,
    duplicate_ref: built.duplicate_ref,
    detection_errors: built.meta.detection_errors,
    extraction_snippet: built.meta.extraction_snippet,
  });
}

export async function reanalyzeImportedArchives(docType = null) {
  const filters = { imported_only: true };
  if (docType) filters.doc_type = docType;
  const rows = await listCrmArchives(filters);
  const clients = await listClients();

  const results = [];
  for (const row of rows) {
    try {
      const updated = await reanalyzeCrmArchive(row.id, clients);
      results.push({ success: true, id: row.id, data: updated });
    } catch (err) {
      results.push({ success: false, id: row.id, error: err.message });
    }
  }
  return results;
}

export async function validateCrmArchiveImport(id, clients = []) {
  const userId = await getAuthUserId();
  const sb = getSupabase();
  const { data: row, error } = await sb.from(TABLE).select('*').eq('id', id).single();
  if (error || !row) throw new Error('Archive introuvable.');
  if (row.statut === 'importe') throw new Error('Archive déjà importée.');
  if (row.statut === 'doublon') throw new Error('Doublon détecté — import impossible.');
  if (row.statut === 'erreur_lecture') throw new Error('PDF illisible — corrigez ou supprimez l\'archive.');

  let clientId = row.client_id;
  if (!clientId) {
    const match = matchClientForArchive(row, clients);
    if (match.client && match.confidence !== 'low' && match.confidence !== 'none') {
      clientId = match.client.id;
    } else {
      throw new Error('Associez un client avant validation.');
    }
  }

  const dup = await checkArchiveDuplicate(row.reference, row.doc_type, id);
  if (dup) {
    await updateCrmArchive(id, { statut: 'doublon', duplicate_ref: dup.reference });
    throw new Error(`Doublon : ${dup.reference} existe déjà (${dup.source}).`);
  }

  let storage_path = row.storage_path;
  const newPath = `crm/archives/${clientId}/${row.doc_type}/${row.storage_path.split('/').pop()}`;
  if (!storage_path.includes(`/crm/archives/${clientId}/`)) {
    storage_path = await moveArchiveFile(row.storage_path, newPath);
  }

  return updateCrmArchive(id, {
    client_id: clientId,
    storage_path,
    statut: 'importe',
    imported_at: new Date().toISOString(),
    validated_by: userId,
  });
}

export async function deleteCrmArchive(id) {
  await getAuthUserId();
  const sb = getSupabase();
  const { data: row } = await sb.from(TABLE).select('storage_path').eq('id', id).maybeSingle();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  if (row?.storage_path) await deleteArchiveFile(row.storage_path);
  return true;
}

export async function getArchivePdfUrl(archive) {
  return resolveArchiveFileUrl(archive?.storage_path);
}

export function filterCrmArchives(records, { search = '', statut = '', doc_type = '', client_id = '' } = {}) {
  const q = search.trim().toLowerCase();
  return (records || []).filter((r) => {
    if (statut && r.statut !== statut) return false;
    if (doc_type && r.doc_type !== doc_type) return false;
    if (client_id && String(r.client_id) !== String(client_id)) return false;
    if (!q) return true;
    const hay = [
      r.file_name,
      r.reference,
      r.client_nom,
      r.client_detected_name,
      r.intitule,
      r.client_ice,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function sortCrmArchives(records, field = 'date_document', dir = 'desc') {
  return [...(records || [])].sort((a, b) => {
    let va = a[field] ?? '';
    let vb = b[field] ?? '';
    if (field === 'total_ttc' || field === 'total_ht') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}
