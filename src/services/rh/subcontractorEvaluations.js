/**
 * Évaluations performance sous-traitant (1–5).
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'subcontractor_evaluations';

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export function normalizeEvaluation(row) {
  if (!row) return null;
  const scores = {
    qualite: Number(row.qualite) || 0,
    respectDelais: Number(row.respect_delais) || 0,
    consignes: Number(row.consignes) || 0,
    securite: Number(row.securite) || 0,
    reactivite: Number(row.reactivite) || 0,
    administratif: Number(row.administratif) || 0,
    communication: Number(row.communication) || 0,
    rapportQualitePrix: Number(row.rapport_qualite_prix) || 0,
  };
  const vals = Object.values(scores).filter((v) => v > 0);
  const note = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    projectName: row.projects?.nom || '',
    ...scores,
    commentaire: row.commentaire || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    note,
    status: row.status || 'validated',
  };
}

export async function listEvaluations(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, projects ( nom )')
    .eq('subcontractor_id', subcontractorId)
    .order('created_at', { ascending: false });
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message || '')) return [];
    throw error;
  }
  return (data || []).map(normalizeEvaluation);
}

export async function createEvaluation(subcontractorId, form = {}) {
  const userId = await getAuthUserId();
  const row = {
    subcontractor_id: subcontractorId,
    project_id: form.projectId || null,
    qualite: Number(form.qualite) || null,
    respect_delais: Number(form.respectDelais) || null,
    consignes: Number(form.consignes) || null,
    securite: Number(form.securite) || null,
    reactivite: Number(form.reactivite) || null,
    administratif: Number(form.administratif) || null,
    communication: Number(form.communication) || null,
    rapport_qualite_prix: Number(form.rapportQualitePrix) || null,
    commentaire: form.commentaire?.trim() || null,
    status: form.status || 'validated',
    created_by: userId,
  };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*, projects ( nom )')
    .single();
  if (error) throw error;
  return normalizeEvaluation(data);
}

export function summarizePerformance({ evaluations = [], assignments = [], kpis = {} } = {}) {
  const validated = (evaluations || []).filter((e) => e.status !== 'cancelled');
  const noteGlobale = validated.length
    ? round1(validated.reduce((s, e) => s + (e.note || 0), 0) / validated.length)
    : 0;
  const projetsEnCours = (assignments || []).filter((a) => a.status === 'active').length;
  const projetsTermines = (assignments || []).filter((a) =>
    ['terminée', 'terminee', 'completed'].includes(String(a.status || '').toLowerCase())).length;

  return {
    projetsRealises: projetsTermines || Math.max(0, (kpis.nombreProjets || 0) - projetsEnCours),
    projetsEnCours: projetsEnCours || 0,
    montantTotalConfie: kpis.travauxRealises || 0,
    montantTotalRealise: kpis.travauxRealises || 0,
    montantTotalPaye: kpis.montantsPayes || 0,
    noteGlobale,
    evaluationsCount: validated.length,
    tauxConformite: noteGlobale > 0 ? round1((noteGlobale / 5) * 100) : null,
    delaiMoyenRealisation: null,
    delaiMoyenPaiement: null,
    nombreRetards: 0,
    nombreReserves: 0,
    nombreLitiges: 0,
  };
}
