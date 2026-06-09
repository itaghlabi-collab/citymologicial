/**
 * documentShares.js — Partages documents (document_shares + is_shared)
 */
import { getSupabase } from '../../lib/supabase';
import { normalizeDocumentDepartment } from '../../constants/documentDepartments';
import { shareDocument } from './mesDocuments';

const TABLE = 'document_shares';

function normalizeShare(row) {
  if (!row) return null;
  return {
    id: row.id,
    document_id: row.document_id || null,
    document: row.document_name || '',
    partage_par: row.partage_par || '',
    partage_avec: row.partage_avec || '',
    departement: row.departement || '',
    date_partage: row.date_partage || '',
    date_expiration: row.date_expiration || '',
    permissions: row.permissions || 'Lecture seule',
    notes: row.notes || '',
    created_at: row.created_at,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise — connectez-vous pour partager un document.');
  return user;
}

export async function listDocumentShares() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeShare);
}

export async function createDocumentShare({ documentId, document, partage_par, partage_avec, departement, date_partage, date_expiration, permissions, notes }) {
  const user = await requireUser();
  const payload = {
    document_id: documentId || null,
    document_name: (document || '').trim(),
    partage_par: (partage_par || '').trim() || null,
    partage_avec: (partage_avec || '').trim(),
    departement: normalizeDocumentDepartment(departement) || null,
    date_partage: date_partage || null,
    date_expiration: date_expiration || null,
    permissions: permissions || 'Lecture seule',
    notes: (notes || '').trim() || null,
    created_by: user.id,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select()
    .single();
  if (error) throw error;

  if (documentId) {
    await shareDocument(documentId);
  }

  return normalizeShare(data);
}

export async function updateDocumentShare(id, form) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      document_name: (form.document || '').trim(),
      partage_par: (form.partage_par || '').trim() || null,
      partage_avec: (form.partage_avec || '').trim(),
      departement: normalizeDocumentDepartment(form.departement) || null,
      date_partage: form.date_partage || null,
      date_expiration: form.date_expiration || null,
      permissions: form.permissions || 'Lecture seule',
      notes: (form.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeShare(data);
}

export async function deleteDocumentShare(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
