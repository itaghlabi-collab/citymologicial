/**
 * documentPublicLinks.js — Liens publics documents (document_public_links)
 */
import { getSupabase } from '../../lib/supabase';
import { resolveAppOrigin } from '../../config/env';
import { normalizeDocumentDepartment } from '../../constants/documentDepartments';

const TABLE = 'document_public_links';

function genToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function normalizeLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    document_id: row.document_id || null,
    document: row.document_name || '',
    departement: row.departement || '',
    token: row.token || '',
    date_creation: formatDate(row.created_at),
    expiration: row.expiration || '',
    mot_de_passe: row.mot_de_passe || '',
    acces_unique: Boolean(row.acces_unique),
    telechargement: Boolean(row.telechargement),
    lecture_seule: Boolean(row.lecture_seule),
    notes: row.notes || '',
    acces_count: row.acces_count || 0,
    download_count: row.download_count || 0,
    statut: row.statut || 'actif',
    created_at: row.created_at,
  };
}

export function buildPublicLinkUrl(token) {
  return `${resolveAppOrigin()}/share/${token}`;
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise — connectez-vous pour gérer les liens publics.');
  return user;
}

async function markDocumentPublic(documentId) {
  if (!documentId) return;
  const { error } = await getSupabase()
    .from('documents')
    .update({ is_public: true })
    .eq('id', documentId)
    .eq('is_deleted', false);
  if (error) throw error;
}

export async function listDocumentPublicLinks() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeLink);
}

export async function createDocumentPublicLink({
  documentId = null,
  document,
  departement,
  expiration,
  mot_de_passe,
  acces_unique,
  telechargement,
  lecture_seule,
  notes,
}) {
  const user = await requireUser();
  const token = genToken();
  const payload = {
    document_id: documentId || null,
    document_name: (document || '').trim(),
    departement: normalizeDocumentDepartment(departement) || null,
    token,
    expiration: expiration || null,
    mot_de_passe: (mot_de_passe || '').trim() || null,
    acces_unique: Boolean(acces_unique),
    telechargement: telechargement !== false,
    lecture_seule: lecture_seule !== false,
    notes: (notes || '').trim() || null,
    statut: 'actif',
    created_by: user.id,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select()
    .single();
  if (error) throw error;

  if (documentId) await markDocumentPublic(documentId);

  const link = normalizeLink(data);
  return { ...link, public_url: buildPublicLinkUrl(link.token) };
}

export async function updateDocumentPublicLink(id, form) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      document_name: (form.document || '').trim(),
      departement: normalizeDocumentDepartment(form.departement) || null,
      expiration: form.expiration || null,
      mot_de_passe: (form.mot_de_passe || '').trim() || null,
      acces_unique: Boolean(form.acces_unique),
      telechargement: form.telechargement !== false,
      lecture_seule: form.lecture_seule !== false,
      notes: (form.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const link = normalizeLink(data);
  return { ...link, public_url: buildPublicLinkUrl(link.token) };
}

export async function toggleDocumentPublicLink(id, statut) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeLink(data);
}

export async function deleteDocumentPublicLink(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPublicLinkMeta(token) {
  const { data, error } = await getSupabase().rpc('get_document_public_link', { p_token: token });
  if (error) throw error;
  return data;
}

export async function verifyPublicLinkAccess(token, password) {
  const { data, error } = await getSupabase().rpc('verify_document_public_link', {
    p_token: token,
    p_password: password || null,
  });
  if (error) throw error;
  return data;
}
