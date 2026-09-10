/**
 * subcontractorAttendance.js — Présence sous-traitants (isolé de attendance ouvriers)
 * Table : public.subcontractor_attendance
 * Aucun lien financier.
 */
import { getSupabase } from '../../lib/supabase';
import { formatSupabaseError } from '../supabase/formatError';
import { subcontractorFullName } from './subcontractors';

const TABLE = 'subcontractor_attendance';
const SCHEMA_HINT =
  'Table présence ST absente — exécutez supabase/RUN_SUBCONTRACTOR_ATTENDANCE.sql dans Supabase (SQL Editor).';

export const SUB_ATT_STATUTS = [
  { value: 'present', label: 'Présent' },
  { value: 'absent', label: 'Absent' },
];

function schemaError(error) {
  const msg = String(error?.message || error || '');
  if (error?.code === '42P01' || msg.includes('subcontractor_attendance')) {
    return new Error(SCHEMA_HINT);
  }
  return new Error(formatSupabaseError(error, 'Erreur présence sous-traitants.'));
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeSubcontractorAttendance(row) {
  if (!row) return null;
  const sub = row.subcontractors || null;
  const project = row.projects || null;
  return {
    id: row.id,
    subcontractor_id: row.subcontractor_id,
    project_id: row.project_id ? String(row.project_id) : '',
    date: row.date || '',
    statut: row.statut === 'absent' ? 'absent' : 'present',
    notes: row.notes || '',
    subcontractor_name: subcontractorFullName(sub) || row.subcontractor_name || '—',
    metier: sub?.fonction || row.metier || '',
    project_name: project?.nom || project?.ref || row.project_name || '—',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listSubcontractorAttendance(filters = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*, subcontractors ( id, prenom, nom, raison_sociale, fonction ), projects ( id, nom, ref )')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.date) q = q.eq('date', filters.date);
  if (filters.dateFrom) q = q.gte('date', filters.dateFrom);
  if (filters.dateTo) q = q.lte('date', filters.dateTo);
  if (filters.subcontractorId) q = q.eq('subcontractor_id', filters.subcontractorId);
  if (filters.projectId) q = q.eq('project_id', filters.projectId);
  if (filters.statut) q = q.eq('statut', filters.statut);

  const { data, error } = await q;
  if (error) throw schemaError(error);
  let rows = (data || []).map(normalizeSubcontractorAttendance);

  if (filters.metier) {
    const m = String(filters.metier).trim().toLowerCase();
    rows = rows.filter((r) => String(r.metier || '').toLowerCase().includes(m));
  }
  if (filters.search) {
    const s = String(filters.search).trim().toLowerCase();
    rows = rows.filter((r) => (
      String(r.subcontractor_name || '').toLowerCase().includes(s)
      || String(r.metier || '').toLowerCase().includes(s)
      || String(r.project_name || '').toLowerCase().includes(s)
    ));
  }
  return rows;
}

/**
 * Upsert un lot de pointages pour une date + projet.
 * Contrainte unique (date, subcontractor_id, project_id) → pas de doublon.
 */
export async function saveSubcontractorAttendanceBatch({
  date,
  projectId,
  entries = [],
} = {}) {
  const uid = await requireUser();
  const d = date || todayISO();
  const pid = projectId ? String(projectId) : '';
  if (!pid) throw new Error('Projet / chantier requis.');
  if (!d) throw new Error('Date requise.');

  const rows = (entries || [])
    .filter((e) => e?.subcontractor_id && (e.statut === 'present' || e.statut === 'absent'))
    .map((e) => ({
      subcontractor_id: e.subcontractor_id,
      project_id: pid,
      date: d,
      statut: e.statut === 'absent' ? 'absent' : 'present',
      notes: e.notes?.trim() || null,
      created_by: uid,
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) throw new Error('Aucun pointage à enregistrer.');

  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(rows, { onConflict: 'date,subcontractor_id,project_id' })
    .select('*, subcontractors ( id, prenom, nom, raison_sociale, fonction ), projects ( id, nom, ref )');

  if (error) throw schemaError(error);
  return (data || []).map(normalizeSubcontractorAttendance);
}

export async function updateSubcontractorAttendance(id, { statut, notes } = {}) {
  await requireUser();
  if (!id) throw new Error('Identifiant requis.');
  const patch = { updated_at: new Date().toISOString() };
  if (statut === 'present' || statut === 'absent') patch.statut = statut;
  if (notes !== undefined) patch.notes = notes?.trim() || null;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*, subcontractors ( id, prenom, nom, raison_sociale, fonction ), projects ( id, nom, ref )')
    .single();
  if (error) throw schemaError(error);
  return normalizeSubcontractorAttendance(data);
}

export async function deleteSubcontractorAttendance(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw schemaError(error);
}

/** Présences déjà saisies pour une date + projet (préremplir le formulaire). */
export async function listAttendanceForDateProject(date, projectId) {
  if (!date || !projectId) return [];
  return listSubcontractorAttendance({ date, projectId });
}
