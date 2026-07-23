/**
 * subcontractors.js — Sous-traitants CRUD + affectations + prestations + paiements
 */
import { getSupabase } from '../../lib/supabase';
import { syncFinanceTransaction, FINANCE_SOURCE_TYPES } from '../finance/financeSync';

const SUB_TABLE = 'subcontractors';
const ASSIGN_TABLE = 'subcontractor_project_assignments';
const SERVICE_TABLE = 'subcontractor_services';
const PAYMENT_TABLE = 'subcontractor_payments';
const ADJ_TABLE = 'subcontractor_project_adjustments';
const DOC_TABLE = 'subcontractor_documents';
const BALANCE_VIEW = 'subcontractor_project_balances';

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function subcontractorFullName(row) {
  if (!row) return '';
  if (row.raison_sociale?.trim()) return row.raison_sociale.trim();
  return [row.prenom, row.nom].filter(Boolean).join(' ').trim() || row.nom || '';
}

export function subcontractorCinLabel(row) {
  if (!row) return '—';
  if (row.numero_cin?.trim()) return row.numero_cin.trim();
  if (row.passeport?.trim()) return row.passeport.trim();
  return '—';
}

export function normalizeSubcontractor(row, summary = {}) {
  if (!row) return null;
  return {
    id: row.id,
    prenom: row.prenom || '',
    nom: row.nom || '',
    raison_sociale: row.raison_sociale || '',
    fullName: subcontractorFullName(row),
    fonction: row.fonction || '',
    numero_cin: row.numero_cin || '',
    passeport: row.passeport || '',
    cinLabel: subcontractorCinLabel(row),
    telephone: row.telephone || '',
    email: row.email || '',
    adresse: row.adresse || '',
    ville: row.ville || '',
    ice: row.ice || '',
    numero_if: row.numero_if || '',
    rc: row.rc || '',
    patente: row.patente || '',
    rib: row.rib || '',
    statut: row.statut || 'actif',
    notes: row.notes || '',
    activeProjectsCount: summary.activeProjectsCount ?? 0,
    totalServices: summary.totalServices ?? 0,
    totalPaid: summary.totalPaid ?? 0,
    remaining: summary.remaining ?? 0,
    currentProject: summary.currentProject ?? '',
    activeAssignments: summary.activeAssignments ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    projectRef: row.project_ref || '',
    projectName: row.project_name || row.projects?.nom || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    role: row.role || '',
    remunerationType: row.remuneration_type || '',
    unitType: row.unit_type || '',
    unitPrice: Number(row.unit_price) || 0,
    estimatedQuantity: Number(row.estimated_quantity) || 0,
    estimatedTotal: Number(row.estimated_total) || 0,
    status: row.status || 'active',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeService(row) {
  if (!row) return null;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    serviceDate: row.service_date || '',
    description: row.description || '',
    quantity: Number(row.quantity) || 0,
    unitType: row.unit_type || '',
    unitPrice: Number(row.unit_price) || 0,
    totalAmount: Number(row.total_amount) || round2(Number(row.quantity) * Number(row.unit_price)),
    status: row.status || 'pending',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizePayment(row) {
  if (!row) return null;
  const qty = Number(row.quantity) || 0;
  const unitPrice = Number(row.unit_price) || 0;
  const grossAmount = Number(row.gross_amount) || round2(qty * unitPrice) || Number(row.amount) || 0;
  const avances = Number(row.avances) || 0;
  const retenues = Number(row.retenues) || 0;
  const amount = Number(row.amount) || round2(Math.max(0, grossAmount - avances - retenues));
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id ? String(row.project_id) : '',
    assignmentId: row.assignment_id,
    paymentDate: row.payment_date || '',
    grossAmount,
    avances,
    retenues,
    amount,
    paymentType: row.payment_type || '',
    designation: row.designation || '',
    quantity: qty,
    unit: row.unit || '',
    unitPrice,
    paymentMethod: row.payment_method || '',
    reference: row.reference || '',
    description: row.description || '',
    status: row.status || 'paid',
    notes: row.notes || '',
    situationId: row.situation_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeBalance(row) {
  if (!row) return null;
  return {
    subcontractorId: row.subcontractor_id,
    subcontractorName: row.subcontractor_name || '',
    projectId: row.project_id ? String(row.project_id) : '',
    projectName: row.project_name || '',
    assignmentId: row.assignment_id,
    remunerationType: row.remuneration_type || '',
    totalServicesAmount: Number(row.total_services_amount) || 0,
    totalPaidAmount: Number(row.total_paid_amount) || 0,
    remainingAmount: Number(row.remaining_amount) || 0,
    paymentStatus: row.payment_status || 'non payé',
  };
}

function toSubcontractorRow(form) {
  return {
    prenom: emptyToNull(form.prenom?.trim()),
    nom: form.nom?.trim(),
    raison_sociale: emptyToNull(form.raison_sociale?.trim()),
    fonction: emptyToNull(form.fonction?.trim()),
    numero_cin: form.numero_cin?.trim() ? form.numero_cin.trim().toUpperCase() : null,
    passeport: emptyToNull(form.passeport?.trim()),
    telephone: emptyToNull(form.telephone?.trim()),
    email: emptyToNull(form.email?.trim()?.toLowerCase()),
    adresse: emptyToNull(form.adresse?.trim()),
    ville: emptyToNull(form.ville?.trim()),
    ice: emptyToNull(form.ice?.trim()),
    numero_if: emptyToNull(form.numero_if?.trim()),
    rc: emptyToNull(form.rc?.trim()),
    patente: emptyToNull(form.patente?.trim()),
    rib: emptyToNull(form.rib?.trim()),
    statut: form.statut || 'actif',
    notes: emptyToNull(form.notes?.trim()),
  };
}

function toAssignmentRow(form, subcontractorId) {
  const qty = Number(form.estimatedQuantity) || 0;
  const price = Number(form.unitPrice) || 0;
  return {
    subcontractor_id: subcontractorId,
    project_id: emptyToNull(form.projectId) || null,
    project_ref: emptyToNull(form.projectRef?.trim()),
    project_name: emptyToNull(form.projectName?.trim()),
    start_date: emptyToNull(form.startDate),
    end_date: emptyToNull(form.endDate),
    role: emptyToNull(form.role?.trim()),
    remuneration_type: emptyToNull(form.remunerationType),
    unit_type: emptyToNull(form.unitType),
    unit_price: price,
    estimated_quantity: qty,
    estimated_total: round2(qty * price),
    status: form.status || 'active',
    notes: emptyToNull(form.notes?.trim()),
  };
}

function toServiceRow(form, subcontractorId) {
  const qty = Number(form.quantity) || 0;
  const price = Number(form.unitPrice) || 0;
  return {
    assignment_id: form.assignmentId,
    subcontractor_id: subcontractorId,
    project_id: emptyToNull(form.projectId) || null,
    service_date: emptyToNull(form.serviceDate),
    description: emptyToNull(form.description?.trim()),
    quantity: qty,
    unit_type: emptyToNull(form.unitType),
    unit_price: price,
    total_amount: round2(qty * price),
    status: form.status || 'pending',
    notes: emptyToNull(form.notes?.trim()),
  };
}

function toPaymentRow(form, subcontractorId) {
  const paymentType = form.paymentType || null;
  const quantity = Number(form.quantity) || 0;
  const unitPrice = Number(form.unitPrice) || 0;
  let grossAmount = Number(form.grossAmount) || 0;
  if (!grossAmount) {
    grossAmount = paymentType === 'metre' ? round2(quantity * unitPrice) : round2(Number(form.amount) || 0);
  }
  const avances = round2(Number(form.avances) || 0);
  const retenues = round2(Number(form.retenues) || 0);
  const net = round2(Math.max(0, grossAmount - avances - retenues));
  return {
    subcontractor_id: subcontractorId,
    project_id: emptyToNull(form.projectId) || null,
    assignment_id: emptyToNull(form.assignmentId) || null,
    payment_date: form.paymentDate,
    payment_type: paymentType,
    designation: emptyToNull(form.designation?.trim()),
    quantity: paymentType === 'metre' ? quantity : 0,
    unit: paymentType === 'metre' ? emptyToNull(form.unit) : null,
    unit_price: paymentType === 'metre' ? unitPrice : 0,
    gross_amount: grossAmount,
    avances,
    retenues,
    amount: net,
    payment_method: emptyToNull(form.paymentMethod),
    reference: emptyToNull(form.reference?.trim()),
    description: emptyToNull(form.lineDescription?.trim()) || emptyToNull(form.description?.trim()),
    status: form.status || 'paid',
    notes: emptyToNull(form.notes?.trim()),
    situation_id: emptyToNull(form.situationId) || null,
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

async function syncSubcontractorPaymentToCash(payment, extra = {}) {
  if (!payment?.id) return null;
  const entity = { ...payment, ...extra };
  return syncFinanceTransaction(FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT, payment.id, { entity });
}

function aggregateSummaries(balances) {
  const map = {};
  (balances || []).forEach((b) => {
    const id = b.subcontractorId;
    if (!map[id]) {
      map[id] = { activeProjectsCount: 0, totalServices: 0, totalPaid: 0, remaining: 0 };
    }
    map[id].activeProjectsCount += 1;
    map[id].totalServices += b.totalServicesAmount;
    map[id].totalPaid += b.totalPaidAmount;
    map[id].remaining += b.remainingAmount;
  });
  return map;
}

export async function listProjectBalances(subcontractorId = null) {
  let q = getSupabase().from(BALANCE_VIEW).select('*');
  if (subcontractorId) q = q.eq('subcontractor_id', subcontractorId);
  const { data, error } = await q.order('project_name');
  if (error) throw error;
  return (data || []).map(normalizeBalance);
}

export async function listSubcontractors() {
  await getAuthUserId();
  const [subsRes, balances, assignRes] = await Promise.all([
    getSupabase().from(SUB_TABLE).select('*').order('nom').order('prenom'),
    listProjectBalances(),
    getSupabase().from(ASSIGN_TABLE).select('subcontractor_id, project_id, project_name, project_ref, status'),
  ]);
  if (subsRes.error) throw subsRes.error;
  if (assignRes.error) throw assignRes.error;
  const summaryMap = aggregateSummaries(balances);
  const activeCountMap = {};
  const activeBySub = {};
  (assignRes.data || []).forEach((a) => {
    if (a.status !== 'active') return;
    activeCountMap[a.subcontractor_id] = (activeCountMap[a.subcontractor_id] || 0) + 1;
    if (!activeBySub[a.subcontractor_id]) activeBySub[a.subcontractor_id] = [];
    activeBySub[a.subcontractor_id].push({
      projectId: a.project_id ? String(a.project_id) : '',
      projectName: a.project_name || a.project_ref || '',
      status: a.status,
    });
  });
  return (subsRes.data || []).map((r) => {
    const base = summaryMap[r.id] || {};
    const activeList = activeBySub[r.id] || [];
    return normalizeSubcontractor(r, {
      ...base,
      activeProjectsCount: activeCountMap[r.id] || 0,
      currentProject: activeList.map((p) => p.projectName).filter(Boolean).join(', ') || '',
      activeAssignments: activeList,
    });
  });
}

export async function getSubcontractor(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase().from(SUB_TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  const balances = await listProjectBalances(id);
  const summary = aggregateSummaries(balances)[id] || {};
  return normalizeSubcontractor(data, summary);
}

export async function createSubcontractor(form) {
  await getAuthUserId();
  const row = toSubcontractorRow(form);
  if (!row.nom) {
    const err = new Error('Nom requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase().from(SUB_TABLE).insert([row]).select('*').single();
  if (error) throw error;
  return normalizeSubcontractor(data);
}

export async function updateSubcontractor(id, form) {
  await getAuthUserId();
  const row = toSubcontractorRow(form);
  const { data, error } = await getSupabase().from(SUB_TABLE).update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeSubcontractor(data);
}

export async function deleteSubcontractor(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(SUB_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listAssignments(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(ASSIGN_TABLE)
    .select('*, projects ( id, nom, ref )')
    .eq('subcontractor_id', subcontractorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeAssignment);
}

export async function createAssignment(subcontractorId, form) {
  await getAuthUserId();
  const row = toAssignmentRow(form, subcontractorId);
  if (!row.project_id && !row.project_name) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase().from(ASSIGN_TABLE).insert([row]).select('*, projects ( id, nom, ref )').single();
  if (error) throw error;
  return normalizeAssignment(data);
}

export async function updateAssignment(id, subcontractorId, form) {
  await getAuthUserId();
  const row = toAssignmentRow(form, subcontractorId);
  const { data, error } = await getSupabase()
    .from(ASSIGN_TABLE).update(row).eq('id', id).select('*, projects ( id, nom, ref )').single();
  if (error) throw error;
  return normalizeAssignment(data);
}

export async function listServices(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(SERVICE_TABLE)
    .select('*')
    .eq('subcontractor_id', subcontractorId)
    .order('service_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeService);
}

export async function createService(subcontractorId, form) {
  await getAuthUserId();
  const row = toServiceRow(form, subcontractorId);
  if (!row.assignment_id) {
    const err = new Error('Affectation projet requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase().from(SERVICE_TABLE).insert([row]).select('*').single();
  if (error) throw error;
  return normalizeService(data);
}

export async function updateService(id, subcontractorId, form) {
  await getAuthUserId();
  const row = toServiceRow(form, subcontractorId);
  const { data, error } = await getSupabase().from(SERVICE_TABLE).update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeService(data);
}

export async function listPayments(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(PAYMENT_TABLE)
    .select('*')
    .eq('subcontractor_id', subcontractorId)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePayment);
}

export async function listAllSubcontractorPayments(limit = 50) {
  await getAuthUserId();
  let q = getSupabase()
    .from(PAYMENT_TABLE)
    .select(`
      *,
      subcontractors ( prenom, nom, raison_sociale ),
      projects ( nom )
    `)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row) => {
    const payment = normalizePayment(row);
    return {
      ...payment,
      subcontractorName: subcontractorFullName(row.subcontractors),
      projectName: row.projects?.nom || '',
    };
  });
}

export async function listAssignmentsByProject(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(ASSIGN_TABLE)
    .select('*, subcontractors ( id, prenom, nom, raison_sociale, fonction ), projects ( id, nom, ref )')
    .eq('project_id', projectId)
    .neq('status', 'annulée')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...normalizeAssignment(row),
    subcontractorName: subcontractorFullName(row.subcontractors),
    subcontractorFonction: row.subcontractors?.fonction || '',
  }));
}

/**
 * Synchronise les sous-traitants affectés à un projet (modale multi-select).
 */
export async function saveProjectSubcontractorAssignments(projectId, subcontractorIds = [], projectMeta = {}) {
  if (!projectId) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  await getAuthUserId();
  const pid = String(projectId);
  const desired = new Set((subcontractorIds || []).map(String));

  const { data: existing, error: listErr } = await getSupabase()
    .from(ASSIGN_TABLE)
    .select('id, subcontractor_id, status')
    .eq('project_id', pid);
  if (listErr) throw listErr;

  const bySub = new Map((existing || []).map((r) => [String(r.subcontractor_id), r]));

  for (const subId of desired) {
    const row = bySub.get(subId);
    if (row) {
      if (row.status !== 'active') {
        const { error } = await getSupabase()
          .from(ASSIGN_TABLE)
          .update({ status: 'active' })
          .eq('id', row.id);
        if (error) throw error;
      }
    } else {
      const { error } = await getSupabase()
        .from(ASSIGN_TABLE)
        .insert([{
          subcontractor_id: subId,
          project_id: pid,
          project_ref: emptyToNull(projectMeta.ref),
          project_name: emptyToNull(projectMeta.nom),
          status: 'active',
        }]);
      if (error) throw error;
    }
  }

  for (const row of existing || []) {
    const sid = String(row.subcontractor_id);
    if (!desired.has(sid) && row.status === 'active') {
      const { error } = await getSupabase()
        .from(ASSIGN_TABLE)
        .update({ status: 'annulée' })
        .eq('id', row.id);
      if (error) throw error;
    }
  }

  return listAssignmentsByProject(pid);
}

export async function removeSubcontractorFromProject(projectId, subcontractorId) {
  if (!projectId || !subcontractorId) return;
  await getAuthUserId();
  const { error } = await getSupabase()
    .from(ASSIGN_TABLE)
    .update({ status: 'annulée' })
    .eq('project_id', projectId)
    .eq('subcontractor_id', subcontractorId)
    .eq('status', 'active');
  if (error) throw error;
}

/** Sous-traitants payables sur un projet : affectations d'abord, sinon tous les actifs */
export async function listSubcontractorsForProjectPayment(projectId) {
  if (!projectId) return [];
  await getAuthUserId();

  const assignments = await listAssignmentsByProject(projectId);
  if (assignments.length) {
    return assignments.map((a) => ({
      ...a,
      lineKey: a.id,
      fromAssignment: true,
    }));
  }

  const { data: subs, error } = await getSupabase()
    .from(SUB_TABLE)
    .select('id, prenom, nom, raison_sociale, fonction, statut')
    .in('statut', ['actif', 'inactif', 'suspendu'])
    .order('nom')
    .order('prenom');
  if (error) throw error;

  return (subs || []).map((sub) => ({
    id: `sub-${sub.id}`,
    lineKey: `sub-${sub.id}`,
    assignmentId: null,
    subcontractorId: sub.id,
    projectId: String(projectId),
    subcontractorName: subcontractorFullName(sub),
    subcontractorFonction: sub.fonction || '',
    fromAssignment: false,
  }));
}

export async function createProjectAdjustment({ subcontractorId, projectId, adjustmentType, amount, description, adjustmentDate }) {
  await getAuthUserId();
  if (!subcontractorId || !adjustmentType || !amount) {
    const err = new Error('Sous-traitant, type et montant requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(ADJ_TABLE)
    .insert([{
      subcontractor_id: subcontractorId,
      project_id: emptyToNull(projectId) || null,
      adjustment_type: adjustmentType,
      amount: round2(amount),
      description: emptyToNull(description?.trim()),
      adjustment_date: adjustmentDate || new Date().toISOString().slice(0, 10),
      status: 'pending',
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getProjectAdjustmentTotals(subcontractorId, projectId) {
  if (!subcontractorId || !projectId) {
    return { totalAvances: 0, totalRetenues: 0 };
  }
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(ADJ_TABLE)
    .select('adjustment_type, amount')
    .eq('subcontractor_id', subcontractorId)
    .eq('project_id', projectId)
    .eq('status', 'pending');
  if (error) {
    console.error('[CITYMO] getProjectAdjustmentTotals', error);
    return { totalAvances: 0, totalRetenues: 0 };
  }
  let totalAvances = 0;
  let totalRetenues = 0;
  (data || []).forEach((row) => {
    const amt = Number(row.amount) || 0;
    if (row.adjustment_type === 'avance') totalAvances += amt;
    if (row.adjustment_type === 'retenue') totalRetenues += amt;
  });
  return { totalAvances: round2(totalAvances), totalRetenues: round2(totalRetenues) };
}

async function applyAdjustmentsByType(paymentId, subcontractorId, projectId, adjustmentType, amountToApply) {
  if (!amountToApply || amountToApply <= 0) return;
  const { data, error } = await getSupabase()
    .from(ADJ_TABLE)
    .select('id, amount')
    .eq('subcontractor_id', subcontractorId)
    .eq('project_id', projectId)
    .eq('adjustment_type', adjustmentType)
    .eq('status', 'pending')
    .order('adjustment_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[CITYMO] applyAdjustmentsByType', error);
    return;
  }
  let remaining = amountToApply;
  for (const adj of data || []) {
    if (remaining <= 0) break;
    const adjAmount = Number(adj.amount) || 0;
    if (adjAmount <= remaining) {
      await getSupabase()
        .from(ADJ_TABLE)
        .update({ status: 'applied', applied_payment_id: paymentId })
        .eq('id', adj.id);
      remaining = round2(remaining - adjAmount);
    }
  }
}

async function applyAdjustmentsForPayment(payment) {
  if (!payment?.id) return;
  await applyAdjustmentsByType(
    payment.id,
    payment.subcontractorId,
    payment.projectId,
    'avance',
    payment.avances,
  );
  await applyAdjustmentsByType(
    payment.id,
    payment.subcontractorId,
    payment.projectId,
    'retenue',
    payment.retenues,
  );
}

export async function createPayment(subcontractorId, form) {
  await getAuthUserId();
  const row = toPaymentRow(form, subcontractorId);
  if (!row.payment_date) {
    const err = new Error('Date requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.gross_amount || row.gross_amount <= 0) {
    const err = new Error('Montant brut requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase().from(PAYMENT_TABLE).insert([row]).select(`
    *,
    subcontractors ( prenom, nom, raison_sociale ),
    projects ( nom )
  `).single();
  if (error) throw error;
  const payment = normalizePayment(data);
  await applyAdjustmentsForPayment(payment);
  await syncSubcontractorPaymentToCash(payment, {
    subcontractorName: subcontractorFullName(data.subcontractors),
    projectName: data.projects?.nom || '',
  });
  return payment;
}

export async function createPaymentBatch(projectId, sharedForm, lines) {
  await getAuthUserId();
  if (!projectId || !lines?.length) {
    const err = new Error('Projet et sous-traitants requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const rows = lines.map((line) => toPaymentRow({
    ...sharedForm,
    ...line,
    projectId,
    assignmentId: line.assignmentId,
  }, line.subcontractorId));

  const { data, error } = await getSupabase().from(PAYMENT_TABLE).insert(rows).select(`
    *,
    subcontractors ( prenom, nom, raison_sociale ),
    projects ( nom )
  `);
  if (error) throw error;
  const payments = (data || []).map(normalizePayment);
  await Promise.all(payments.map(applyAdjustmentsForPayment));
  await Promise.all((data || []).map((row, i) => syncSubcontractorPaymentToCash(payments[i], {
    subcontractorName: subcontractorFullName(row.subcontractors),
    projectName: row.projects?.nom || '',
  })));
  return payments;
}

export async function updateSubcontractorPayment(id, form, subcontractorId) {
  await getAuthUserId();
  const row = toPaymentRow({ ...form, subcontractorId }, subcontractorId);
  if (!row.gross_amount || row.gross_amount <= 0) {
    const err = new Error('Montant brut requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(PAYMENT_TABLE)
    .update(row)
    .eq('id', id)
    .select(`
      *,
      subcontractors ( prenom, nom, raison_sociale ),
      projects ( nom )
    `)
    .single();
  if (error) throw error;
  const payment = {
    ...normalizePayment(data),
    subcontractorName: subcontractorFullName(data.subcontractors),
    projectName: data.projects?.nom || '',
  };
  await syncSubcontractorPaymentToCash(payment);
  return payment;
}

/** Réconciliation : chaque paiement sous-traitant → créer / mettre à jour / supprimer la ligne caisse. */
export async function backfillSubcontractorPaymentsToCash() {
  const rows = await listAllSubcontractorPayments(null);
  let synced = 0;
  let removed = 0;
  const errors = [];
  for (const p of rows) {
    try {
      const r = await syncFinanceTransaction(FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT, p.id, { entity: p });
      if (r?.action === 'created' || r?.action === 'updated') synced += 1;
      if (r?.action === 'deleted') removed += 1;
    } catch (err) {
      if (err?.code === 'SCHEMA') throw err;
      errors.push({ id: p.id, message: err?.message || String(err) });
    }
  }
  return { synced, removed, errors };
}

export async function listDocuments(subcontractorId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(DOC_TABLE)
    .select('*')
    .eq('subcontractor_id', subcontractorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSubcontractorDocument(subcontractorId, form = {}) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(DOC_TABLE)
    .insert([{
      subcontractor_id: subcontractorId,
      doc_type: emptyToNull(form.doc_type) || 'other',
      file_name: emptyToNull(form.file_name?.trim()),
      storage_path: emptyToNull(form.storage_path?.trim()),
      mime_type: emptyToNull(form.mime_type?.trim()),
      notes: emptyToNull(form.notes?.trim()),
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function computeListKpis(items = []) {
  return {
    actifs: items.filter((s) => s.statut === 'actif').length,
    inactifs: items.filter((s) => ['inactif', 'suspendu', 'archive'].includes(s.statut)).length,
    totalServices: items.reduce((sum, s) => sum + Number(s.totalServices || 0), 0),
    totalPaid: items.reduce((sum, s) => sum + Number(s.totalPaid || 0), 0),
    remaining: items.reduce((sum, s) => sum + Number(s.remaining || 0), 0),
  };
}

export function normalizeFilterKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function mergeSubcontractorMetiers(items = [], presets = []) {
  const seen = new Set();
  const out = [];
  [...presets, ...(items || []).map((i) => i.fonction).filter(Boolean)].forEach((m) => {
    const key = normalizeFilterKey(m);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(String(m).trim());
  });
  return out.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export function filterSubcontractors(items = [], filters = {}) {
  const {
    search = '', nom = '', telephone = '', cin = '',
    metier = '', ville = '', projet = '', statut = '',
  } = filters;
  const q = search.trim().toLowerCase();
  const nomQ = nom.trim().toLowerCase();
  const telQ = telephone.trim();
  const cinQ = cin.trim().toLowerCase();
  const villeQ = ville.trim().toLowerCase();
  const metierQ = normalizeFilterKey(metier);

  return items.filter((s) => {
    if (statut && s.statut !== statut) return false;
    if (metierQ) {
      const fn = normalizeFilterKey(s.fonction);
      if (!fn || fn !== metierQ) return false;
    }
    if (villeQ && !(s.ville || '').toLowerCase().includes(villeQ)) return false;
    if (nomQ && !s.fullName.toLowerCase().includes(nomQ)) return false;
    if (telQ && !(s.telephone || '').includes(telQ)) return false;
    if (cinQ) {
      const cinHay = `${s.numero_cin || ''} ${s.passeport || ''}`.toLowerCase();
      if (!cinHay.includes(cinQ)) return false;
    }
    if (projet) {
      const matches = (s.activeAssignments || []).some((a) => String(a.projectId) === String(projet));
      if (!matches) return false;
    }
    if (q) {
      const hay = [
        s.fullName, s.fonction, s.telephone, s.numero_cin, s.passeport,
        s.ville, s.currentProject, s.email,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeGlobalSummary(balances, assignments = []) {
  const list = balances || [];
  const activeProjects = (assignments || []).filter((a) => a.status === 'active').length;
  return {
    totalServices: list.reduce((s, b) => s + b.totalServicesAmount, 0),
    totalPaid: list.reduce((s, b) => s + b.totalPaidAmount, 0),
    remaining: list.reduce((s, b) => s + b.remainingAmount, 0),
    activeProjects,
  };
}
