/**
 * leaves.js — Congés CRUD (Supabase public.leaves)
 */
import { getSupabase } from '../../lib/supabase';
import { notifySuperAdminLeaveRequest } from './notifyLeaveRequest';

const TABLE = 'leaves';

export function employeeFullName(emp) {
  if (!emp) return '';
  return [emp.firstname, emp.lastname].filter(Boolean).join(' ').trim();
}

export function findEmployeeByEmail(employees, email) {
  if (!email || !employees?.length) return null;
  const q = email.toLowerCase();
  return employees.find((e) => e.email?.toLowerCase() === q) || null;
}

/** UI row helpers (dates affichées dans le tableau) */
export function normalizeLeave(row) {
  if (!row) return row;
  const name =
    row.employe_label ||
    employeeFullName(row.employees) ||
    row.employe ||
    '-';

  const fichierLabel = row.fichier_url
    ? row.fichier_url.includes('/') ? row.fichier_url.split('/').pop() : row.fichier_url
    : null;

  return {
    ...row,
    employe: name,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    dateRetour: row.date_retour,
    fichier: fichierLabel,
    _statut: row.statut || 'En attente',
  };
}

export function toLeaveRow(form, meta = {}) {
  const {
    jours = 0,
    dateRetour = null,
    employeLabel = '',
    fichierUrl = null,
    statut = 'En attente',
  } = meta;

  return {
    employee_id: form.employee_id || null,
    employe_label: employeLabel || null,
    type: form.type || 'Conge annuel',
    date_debut: form.dateDebut,
    date_fin: form.dateFin,
    date_retour: dateRetour || null,
    jours: jours || 0,
    raison: form.raison?.trim() || null,
    statut,
    fichier_url: fichierUrl,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error) {
    console.error('[CITYMO] leaves auth.getUser', error);
    throw error;
  }
  if (!user) {
    const err = new Error('Session expirée. Veuillez vous reconnecter.');
    err.code = 'PGRST301';
    throw err;
  }
  return user.id;
}

function isMissingCreatedByColumn(error) {
  const msg = error?.message || '';
  return error?.code === '42703' || msg.includes('created_by');
}

async function insertLeaveRow(row) {
  const supabase = getSupabase();
  let attempt = await supabase.from(TABLE).insert([row]).select(LEAVE_SELECT).single();

  if (attempt.error && isMissingCreatedByColumn(attempt.error) && row.created_by) {
    console.warn('[CITYMO] leaves.created_by absent — exécutez migrations/20260525200000_leaves_rls_super_admin.sql');
    const { created_by: _drop, ...legacyRow } = row;
    attempt = await supabase.from(TABLE).insert([legacyRow]).select(LEAVE_SELECT).single();
  }

  if (attempt.error) {
    console.error('[CITYMO] leaves insert', attempt.error, row);
    throw attempt.error;
  }
  return attempt.data;
}

const LEAVE_SELECT = `
  *,
  employees ( id, firstname, lastname, email )
`;

export async function listLeaves() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(LEAVE_SELECT)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] leaves list', error);
    throw error;
  }
  return (data || []).map(normalizeLeave);
}

export async function createLeave(form, meta) {
  const userId = await getAuthUserId();
  const row = {
    ...toLeaveRow(form, { ...meta, statut: 'En attente' }),
    created_by: userId,
  };

  if (!row.employee_id) {
    const err = new Error('Employé requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.date_debut || !row.date_fin) {
    const err = new Error('Dates de début et fin requises.');
    err.code = 'VALIDATION';
    throw err;
  }

  const data = await insertLeaveRow(row);
  const created = normalizeLeave(data);

  notifySuperAdminLeaveRequest(created).catch((notifyErr) => {
    console.warn('[CITYMO] notify leave email failed', notifyErr);
  });
  import('../notifications/notificationEvents').then(({ notifyLeaveCreated }) => {
    notifyLeaveCreated(created).catch(() => {});
  });

  return created;
}

export async function updateLeave(id, form, meta) {
  await getAuthUserId();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toLeaveRow(form, meta))
    .eq('id', id)
    .select(LEAVE_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] leaves update', error, { id, form, meta });
    throw error;
  }
  return normalizeLeave(data);
}

export async function updateLeaveStatut(id, statut) {
  await getAuthUserId();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut })
    .eq('id', id)
    .select(LEAVE_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] leaves update statut', error, { id, statut });
    throw error;
  }
  const updated = normalizeLeave(data);
  import('../notifications/notificationEvents').then(({ notifyLeaveStatusChanged }) => {
    notifyLeaveStatusChanged(updated, statut).catch(() => {});
  });
  return updated;
}

/**
 * Approuve une demande avec snapshot des droits + débit solde si type consommateur.
 * @param {{ override?: boolean, overrideReason?: string, employee?: object }} options
 */
export async function approveLeaveWithBalance(id, options = {}) {
  const userId = await getAuthUserId();
  const { data: existing, error: getErr } = await getSupabase()
    .from(TABLE)
    .select(LEAVE_SELECT)
    .eq('id', id)
    .single();
  if (getErr) throw getErr;
  const leave = normalizeLeave(existing);
  if ((leave._statut || leave.statut) !== 'En attente') {
    throw new Error('Seules les demandes en attente peuvent être approuvées.');
  }
  if (leave.balance_debited) {
    throw new Error('Cette demande a déjà été débitée.');
  }

  const {
    computeLeaveRightsPreview,
    snapshotFieldsFromPreview,
    recordBalanceMovement,
  } = await import('./leaveBalance');

  let employee = options.employee || leave.employees || null;
  if (!employee && leave.employee_id) {
    const { data: emp } = await getSupabase()
      .from('employees')
      .select('*')
      .eq('id', leave.employee_id)
      .maybeSingle();
    employee = emp;
  }

  const preview = await computeLeaveRightsPreview({
    employee,
    type: leave.type,
    dateDebut: leave.date_debut || leave.dateDebut,
    dateFin: leave.date_fin || leave.dateFin,
    joursOverride: leave.jours,
    excludeLeaveId: leave.id,
  });

  if (preview.consumes && preview.depasseSolde && !options.override) {
    const err = new Error(
      `Solde insuffisant (${preview.soldeAvant} j. disponibles, ${preview.joursDemandes} j. demandés).`,
    );
    err.code = 'BALANCE_EXCEEDED';
    err.preview = preview;
    throw err;
  }

  const snap = snapshotFieldsFromPreview(preview, {
    override: !!options.override,
    overrideReason: options.overrideReason,
    userId,
  });

  const patch = {
    statut: 'Approuve',
    ...snap,
    balance_debited: preview.consumes,
    balance_restored: false,
  };

  let { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select(LEAVE_SELECT)
    .single();

  // Fallback si colonnes snapshot absentes
  if (error && (String(error.message || '').includes('snap_') || error.code === 'PGRST204')) {
    console.warn('[CITYMO] snapshot columns missing — approve statut only. Run RUN_LEAVE_BALANCE.sql');
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .update({ statut: 'Approuve' })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single());
  }
  if (error) throw error;

  const updated = normalizeLeave(data);

  if (preview.consumes && leave.employee_id) {
    await recordBalanceMovement({
      employeeId: leave.employee_id,
      leaveId: id,
      kind: 'debit_approve',
      days: -Math.abs(preview.joursDemandes),
      anneeRef: preview.anneeRef,
      note: `Approbation ${leave.type}`,
      userId,
    });
    // Reliquat salarié = report manuel ; le solde réel = reliquat + acquis − consommés (approuvés).
  }

  import('../notifications/notificationEvents').then(({ notifyLeaveStatusChanged }) => {
    notifyLeaveStatusChanged(updated, 'Approuve').catch(() => {});
  });
  return updated;
}

/** Annule une demande approuvée et restitue les jours (sans double crédit). */
export async function cancelApprovedLeave(id) {
  const userId = await getAuthUserId();
  const { data: existing, error: getErr } = await getSupabase()
    .from(TABLE)
    .select(LEAVE_SELECT)
    .eq('id', id)
    .single();
  if (getErr) throw getErr;
  const leave = normalizeLeave(existing);
  if ((leave._statut || leave.statut) !== 'Approuve') {
    throw new Error('Seules les demandes approuvées peuvent être annulées.');
  }
  if (leave.balance_restored) {
    throw new Error('Les jours de cette demande ont déjà été restitués.');
  }

  const joursAccordes = Number(leave.snap_jours_accordes ?? leave.jours) || 0;
  const consumes = leave.consumes_balance || (await import('./leaveBalance')).leaveTypeConsumesBalance(leave.type);

  const patch = {
    statut: 'Annule',
    balance_restored: true,
  };

  let { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select(LEAVE_SELECT)
    .single();

  if (error && String(error.message || '').includes('Annule')) {
    // CHECK statut sans Annule → Refuse + flag restored si possible
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .update({ statut: 'Refuse', balance_restored: true })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single());
  }
  if (error && error.code === 'PGRST204') {
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .update({ statut: 'Refuse' })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single());
  }
  if (error) throw error;

  if (consumes && leave.balance_debited && leave.employee_id && joursAccordes > 0) {
    const { recordBalanceMovement } = await import('./leaveBalance');
    await recordBalanceMovement({
      employeeId: leave.employee_id,
      leaveId: id,
      kind: 'credit_cancel',
      days: Math.abs(joursAccordes),
      anneeRef: null,
      note: 'Annulation demande approuvée — restitution',
      userId,
    });
    // Restitution via retrait du statut Approuve (sumConsumedApprovedDays).
  }

  const updated = normalizeLeave(data);
  import('../notifications/notificationEvents').then(({ notifyLeaveStatusChanged }) => {
    notifyLeaveStatusChanged(updated, updated.statut).catch(() => {});
  });
  return updated;
}

export async function deleteLeave(id) {
  await getAuthUserId();

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] leaves delete', error, { id });
    throw error;
  }
}

export function computeLeaveStats(leaves) {
  const list = leaves || [];
  const isPending = (s) => s === 'En attente';
  const isApproved = (s) => s === 'Approuve';
  const isRejected = (s) => s === 'Refuse' || s === 'Annule';

  return {
    all: list.length,
    pending: list.filter((l) => isPending(l._statut || l.statut)).length,
    approved: list.filter((l) => isApproved(l._statut || l.statut)).length,
    rejected: list.filter((l) => isRejected(l._statut || l.statut)).length,
  };
}

export function filterLeaves(leaves, filterKey) {
  const list = leaves || [];
  if (filterKey === 'all') return list;

  return list.filter((r) => {
    const s = r._statut || r.statut;
    if (filterKey === 'pending') return s === 'En attente';
    if (filterKey === 'approved') return s === 'Approuve';
    if (filterKey === 'rejected') return s === 'Refuse' || s === 'Annule';
    return true;
  });
}

export function canEditLeave(row, { userId, canManageLeaves, superAdmin }) {
  if (!row || row._statut !== 'En attente') return false;
  if (canManageLeaves || superAdmin) return true;
  return row.created_by === userId;
}

export function canDeleteLeave(row, { userId, canManageLeaves, superAdmin }) {
  if (!row) return false;
  if (canManageLeaves || superAdmin) return true;
  return row.created_by === userId && row._statut === 'En attente';
}
