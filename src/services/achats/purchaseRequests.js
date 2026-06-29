/**
 * purchaseRequests.js — Demandes d'achat (Supabase purchase_requests)
 */
import { getSupabase } from '../../lib/supabase';
import { employeeFullName } from '../rh/employees';
import { PURCHASE_ASSIGNEE, normalizePurchaseStatus } from '../../constants/purchaseWorkflow';
import { listProjects } from '../projects/projects';

const TABLE = 'purchase_requests';
const ACHATS_DEPARTMENT_ID = 3;

export function projectOptionLabel(p) {
  if (!p) return '';
  const client = p.client || p.client_nom || '';
  return [p.ref, p.nom, client].filter(Boolean).join(' — ');
}

export function normalizePurchaseRequest(row) {
  if (!row) return null;
  const projectLabel = row.project_ref && row.project_name
    ? projectOptionLabel({ ref: row.project_ref, nom: row.project_name, client: '' })
    : row.project_name || row.project_ref || '';

  return {
    id: row.id,
    ref: row.ref_demande || '',
    titre: row.titre || '',
    priorite: row.priorite || 'Normale',
    statut: normalizePurchaseStatus(row.statut || 'Brouillon'),
    date_debut: row.date_debut || '',
    date_limite: row.date_limite || '',
    description: row.description || '',
    department: row.department || 'ACHATS',
    departement: row.department || 'ACHATS',
    project_id: row.project_id || null,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    projet_lie: projectLabel,
    assigned_employee_id: row.assigned_employee_id || null,
    assigned_employee_name: row.assigned_employee_name || PURCHASE_ASSIGNEE.label,
    assignes: row.assigned_employee_name || PURCHASE_ASSIGNEE.label,
    requester_user_id: row.requester_user_id || row.created_by || null,
    requester_name: row.requester_name || '',
    demandeur: row.requester_name || '',
    selected_quote_id: row.selected_quote_id || null,
    acquisition_order_id: row.acquisition_order_id || null,
    payment_order_id: row.payment_order_id || null,
    commentaires_internes: row.commentaires_internes || '',
    created_by: row.created_by || null,
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: row.payload || {},
  };
}

export function toPurchaseRequestRow(form) {
  const projetLie = (form.projet_lie || form.project_name || '').trim();
  return {
    ref_demande: form.ref || form.ref_demande || null,
    titre: (form.titre || '').trim(),
    priorite: form.priorite || 'Normale',
    statut: form.statut || 'Brouillon',
    date_debut: form.date_debut || null,
    date_limite: form.date_limite || null,
    description: form.description?.trim() || null,
    department: 'ACHATS',
    project_id: form.project_id || null,
    project_ref: form.project_ref || null,
    project_name: projetLie || null,
    assigned_employee_id: form.assigned_employee_id || null,
    assigned_employee_name: form.assigned_employee_name || PURCHASE_ASSIGNEE.label,
    commentaires_internes: form.commentaires_internes?.trim() || null,
    payload: form.payload || {},
  };
}

export function getPurchaseRequestLineSummary(request) {
  const line = request?.payload?.lines?.[0];
  return {
    fournisseur: request?.payload?.fournisseur_souhaite || line?.fournisseur || '',
    quantite: line?.quantite ?? line?.quantite_demandee ?? '',
    unite: line?.unite || line?.unit || 'u',
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generatePurchaseRequestRef() {
  const year = new Date().getFullYear();
  const prefix = `DA-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_demande', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

export async function listPurchaseRequests() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePurchaseRequest);
}

export async function createPurchaseRequest(form) {
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser();
  if (authErr || !user) throw new Error('Session requise.');
  const uid = user.id;
  const assignee = await import('./purchaseWorkflow').then((m) => m.resolveAchatsAssignee());
  const row = {
    ...toPurchaseRequestRow(form),
    ...assignee,
    requester_user_id: uid,
    requester_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Système',
  };
  if (!row.ref_demande) row.ref_demande = await generatePurchaseRequestRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function findPurchaseRequestBySiteMaterialRequest(siteRequestId) {
  if (!siteRequestId) return null;
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('payload->>site_material_request_id', String(siteRequestId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[CITYMO] findPurchaseRequestBySiteMaterialRequest', error);
    return null;
  }
  return data ? normalizePurchaseRequest(data) : null;
}

/**
 * Crée une demande d'achat liée à une demande chantier en rupture / stock insuffisant.
 * Idempotent : une seule DA par demande chantier.
 */
export async function createPurchaseRequestFromSiteRuptures(siteRequest) {
  if (!siteRequest?.id) return null;
  const existing = await findPurchaseRequestBySiteMaterialRequest(siteRequest.id);
  if (existing) return existing;

  const lines = (siteRequest.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
  const deficitLines = lines.filter((l) => {
    const qty = Number(l.quantite_demandee) || 0;
    const prep = Number(l.quantite_preparee) || 0;
    return l.rupture || prep < qty;
  });
  if (!deficitLines.length) return null;

  const itemsDesc = deficitLines.map((l) => {
    const manque = Math.max(0, (Number(l.quantite_demandee) || 0) - (Number(l.quantite_preparee) || 0));
    return `• ${l.article_name}: ${manque} ${l.unite || 'u'}${l.rupture ? ' (rupture stock)' : ''}`;
  }).join('\n');

  return createPurchaseRequest({
    titre: `Rupture stock — ${siteRequest.ref}`,
    priorite: siteRequest.priorite === 'Critique' ? 'Urgente' : (siteRequest.priorite || 'Normale'),
    statut: 'En étude',
    project_id: siteRequest.project_id || null,
    project_ref: siteRequest.project_ref || null,
    project_name: siteRequest.project_name || null,
    date_limite: siteRequest.date_souhaitee || null,
    description: [
      'Demande d\'achat générée automatiquement (rupture / stock insuffisant).',
      '',
      `Demande chantier : ${siteRequest.ref}`,
      `Projet : ${siteRequest.project_name || '—'}`,
      '',
      'Articles :',
      itemsDesc,
    ].join('\n'),
    payload: {
      site_material_request_id: siteRequest.id,
      site_material_request_ref: siteRequest.ref,
      source: 'site_material_rupture',
      lines: deficitLines.map((l) => ({
        article_name: l.article_name,
        article_id: l.article_id || null,
        quantite_manquante: Math.max(0, (Number(l.quantite_demandee) || 0) - (Number(l.quantite_preparee) || 0)),
        unite: l.unite || 'u',
        rupture: !!l.rupture,
      })),
    },
  });
}

export async function updatePurchaseRequest(id, form) {
  await requireUser();
  const row = toPurchaseRequestRow(form);
  delete row.statut;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function deletePurchaseRequest(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listAchatsEmployees() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, poste, department, department_id, statut')
    .or(`department_id.eq.${ACHATS_DEPARTMENT_ID},department.ilike.%ACHAT%`)
    .order('lastname', { ascending: true });
  if (error) throw error;
  return (data || []).filter((e) => {
    if (e.statut === 'Inactif') return false;
    const dept = (e.department || '').toUpperCase();
    return e.department_id === ACHATS_DEPARTMENT_ID || dept.includes('ACHAT');
  });
}

export function employeeOptionLabel(emp) {
  const name = employeeFullName(emp);
  return `${name}${emp.poste ? ` — ${emp.poste}` : ''}`;
}

export async function loadPurchaseRequestFormOptions() {
  const [projects, employees] = await Promise.all([
    listProjects().catch(() => []),
    listAchatsEmployees().catch(() => []),
  ]);
  return { projects, employees };
}
