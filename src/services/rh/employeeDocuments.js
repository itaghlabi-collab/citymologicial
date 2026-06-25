/**
 * employeeDocuments.js — Dossier documentaire employé (métadonnées + storage)
 */
import { getSupabase } from '../../lib/supabase';
import {
  uploadEmployeeFile,
  deleteEmployeeStorageFiles,
  resolveEmployeeFileUrl,
} from './employeeStorage';

const TABLE = 'employee_documents';

export const EMP_DOC_SECTIONS = [
  {
    id: 'admin',
    label: 'Documents administratifs',
    icon: '📄',
    types: [
      { value: 'contrat_travail', label: 'Contrat de travail' },
      { value: 'avenant', label: 'Avenants' },
      { value: 'fiche_poste', label: 'Fiche de poste' },
      { value: 'reglement_interieur', label: 'Règlement intérieur signé' },
      { value: 'lettre_embauche', label: 'Lettre d\'embauche' },
    ],
  },
  {
    id: 'identite',
    label: 'Pièces d\'identité',
    icon: '🪪',
    types: [
      { value: 'cin_recto', label: 'CIN Recto' },
      { value: 'cin_verso', label: 'CIN Verso' },
      { value: 'passeport', label: 'Passeport' },
      { value: 'permis_conduire', label: 'Permis de conduire' },
    ],
  },
  {
    id: 'rh',
    label: 'Documents RH',
    icon: '💰',
    types: [
      { value: 'bulletin_paie', label: 'Bulletins de paie' },
      { value: 'attestation_salaire', label: 'Attestation de salaire' },
      { value: 'attestation_travail', label: 'Attestation de travail' },
      { value: 'attestation_cnss', label: 'Attestation CNSS' },
    ],
  },
  {
    id: 'sante',
    label: 'Santé',
    icon: '🏥',
    types: [
      { value: 'aptitude_medicale', label: 'Aptitude médicale' },
      { value: 'certificat_medical', label: 'Certificats médicaux' },
      { value: 'arret_maladie', label: 'Arrêts maladie' },
    ],
  },
  {
    id: 'formation',
    label: 'Formations',
    icon: '🎓',
    types: [
      { value: 'diplome', label: 'Diplômes' },
      { value: 'certificat', label: 'Certificats' },
      { value: 'attestation_formation', label: 'Attestations de formation' },
    ],
  },
  {
    id: 'autre',
    label: 'Autres documents',
    icon: '📁',
    types: [
      { value: 'autre', label: 'Autre document' },
    ],
  },
];

const TYPE_MAP = Object.fromEntries(
  EMP_DOC_SECTIONS.flatMap((s) => s.types.map((t) => [t.value, { ...t, sectionId: s.id, sectionLabel: s.label }])),
);

const SECTION_MAP = Object.fromEntries(EMP_DOC_SECTIONS.map((s) => [s.id, s]));

function normalizeDoc(row, signedUrl = '') {
  if (!row) return null;
  const typeInfo = TYPE_MAP[row.doc_type] || null;
  return {
    id: row.id,
    employee_id: row.employee_id,
    storage_path: row.storage_path,
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size || 0),
    category: row.category || typeInfo?.sectionId || 'autre',
    doc_type: row.doc_type || 'autre',
    doc_type_label: typeInfo?.label || row.doc_type || 'Document',
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    url: signedUrl,
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

export function getDocTypeLabel(docType) {
  return TYPE_MAP[docType]?.label || docType || 'Document';
}

export function getSectionLabel(category) {
  return SECTION_MAP[category]?.label || category || 'Autres';
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatFileType(mimeType, fileName) {
  const ext = (fileName || '').split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 5) return ext;
  if (!mimeType) return '—';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'JPG';
  if (mimeType.includes('png')) return 'PNG';
  if (mimeType.includes('word')) return 'DOCX';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLSX';
  return mimeType.split('/').pop()?.toUpperCase() || '—';
}

export function computeEmployeeDocStats(docs) {
  const list = docs || [];
  const totalSize = list.reduce((s, d) => s + Number(d.file_size || 0), 0);
  const dates = list.map((d) => d.updated_at || d.created_at).filter(Boolean).sort();
  return {
    count: list.length,
    totalSize,
    lastUpdate: dates.length ? dates[dates.length - 1] : null,
  };
}

export function groupDocumentsBySection(docs) {
  const grouped = Object.fromEntries(EMP_DOC_SECTIONS.map((s) => [s.id, []]));
  (docs || []).forEach((doc) => {
    const key = grouped[doc.category] ? doc.category : 'autre';
    grouped[key].push(doc);
  });
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  });
  return grouped;
}

export async function listEmployeeDocuments(employeeId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] employee_documents list', error);
    throw error;
  }
  const rows = data || [];
  return Promise.all(rows.map(async (row) => {
    const url = await resolveEmployeeFileUrl(row.storage_path);
    return normalizeDoc(row, url);
  }));
}

export async function addEmployeeDocument(employeeId, file, { category = 'autre', doc_type = 'autre' } = {}) {
  await getAuthUserId();
  const storage_path = await uploadEmployeeFile(employeeId, file);
  const now = new Date().toISOString();
  const payload = {
    employee_id: employeeId,
    storage_path,
    file_name: file.name,
    mime_type: file.type || null,
    file_size: file.size,
    category: category || 'autre',
    doc_type: doc_type || 'autre',
    updated_at: now,
  };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select('*')
    .single();
  if (error) {
    await deleteEmployeeStorageFiles([storage_path]);
    console.error('[CITYMO] employee_documents insert', error);
    throw error;
  }
  const url = await resolveEmployeeFileUrl(data.storage_path);
  return normalizeDoc(data, url);
}

export async function renameEmployeeDocument(docId, fileName) {
  await getAuthUserId();
  const name = String(fileName || '').trim();
  if (!name) throw new Error('Nom du document requis.');
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ file_name: name, updated_at: new Date().toISOString() })
    .eq('id', docId)
    .select('*')
    .single();
  if (error) throw error;
  const url = await resolveEmployeeFileUrl(data.storage_path);
  return normalizeDoc(data, url);
}

export async function deleteEmployeeDocument(docId) {
  await getAuthUserId();
  const { data: row, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('storage_path')
    .eq('id', docId)
    .single();
  if (fetchErr) throw fetchErr;

  const { error } = await getSupabase().from(TABLE).delete().eq('id', docId);
  if (error) throw error;

  if (row?.storage_path) await deleteEmployeeStorageFiles([row.storage_path]);
}

export async function purgeEmployeeDocuments(employeeId) {
  const { data: docs, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('storage_path')
    .eq('employee_id', employeeId);
  if (fetchErr) throw fetchErr;

  const paths = (docs || []).map((d) => d.storage_path).filter(Boolean);
  const { error } = await getSupabase().from(TABLE).delete().eq('employee_id', employeeId);
  if (error) throw error;

  await deleteEmployeeStorageFiles(paths);
}
