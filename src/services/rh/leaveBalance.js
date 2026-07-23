/**
 * leaveBalance.js — Calcul des droits au congé (solde / snapshot)
 */
import { getSupabase } from '../../lib/supabase';
import { countWorkingDays, WORKING_DAYS_RULE_LABEL } from './workingDays';

export const BALANCE_LEAVE_TYPES = new Set([
  'Conge annuel',
  'Congé annuel',
  'Conge de recuperation',
  'Congé de récupération',
  'Conge de récupération',
]);

export function leaveTypeConsumesBalance(type) {
  return BALANCE_LEAVE_TYPES.has(String(type || '').trim());
}

export function leaveTypeLabelForPdf(type) {
  const t = String(type || '').trim();
  if (/recuperation|récupération/i.test(t)) return 'congé de récupération';
  if (/annuel/i.test(t)) return 'congé annuel';
  if (/maladie/i.test(t)) return 'congé maladie';
  if (/exceptionnel/i.test(t)) return 'congé exceptionnel';
  if (/sans solde/i.test(t)) return 'congé sans solde';
  return t ? t.toLowerCase() : 'congé';
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(num(n) * 100) / 100;
}

/** Droit acquis : paramètre annuel salarié (prorata simple si embauche dans l’année). */
export function computeDroitAcquis(employee, anneeRef = new Date().getFullYear()) {
  const annuel = num(employee?.conges_jours_annuels, 0);
  if (annuel <= 0) return 0;
  const emb = employee?.date_embauche ? String(employee.date_embauche).slice(0, 10) : '';
  if (!emb) return round2(annuel);
  const embYear = Number(emb.slice(0, 4));
  if (embYear < anneeRef) return round2(annuel);
  if (embYear > anneeRef) return 0;
  const embDate = new Date(Number(emb.slice(0, 4)), Number(emb.slice(5, 7)) - 1, Number(emb.slice(8, 10)));
  const yearEnd = new Date(anneeRef, 11, 31);
  const yearStart = new Date(anneeRef, 0, 1);
  const start = embDate > yearStart ? embDate : yearStart;
  const daysInYear = (yearEnd - yearStart) / 86400000 + 1;
  const daysWorked = Math.max(0, (yearEnd - start) / 86400000 + 1);
  return round2((annuel * daysWorked) / daysInYear);
}

/** Jours travaillés de référence (override RH ou estimation depuis embauche). */
export function computeJoursTravailles(employee, anneeRef = new Date().getFullYear()) {
  if (employee?.conges_jours_travailles != null && employee.conges_jours_travailles !== '') {
    return round2(employee.conges_jours_travailles);
  }
  const emb = employee?.date_embauche ? String(employee.date_embauche).slice(0, 10) : '';
  const yearStart = `${anneeRef}-01-01`;
  const today = new Date();
  const yearEndIso = today.getFullYear() === anneeRef
    ? `${anneeRef}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    : `${anneeRef}-12-31`;
  const start = emb && emb > yearStart ? emb : yearStart;
  if (!start) return 0;
  // Approximation calendaire hors dimanches (sans fériés pour la période longue — simple)
  const s = new Date(start);
  const e = new Date(yearEndIso);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() !== 0) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export async function sumConsumedApprovedDays(employeeId, { excludeLeaveId = null, anneeRef = null } = {}) {
  if (!employeeId) return 0;
  let q = getSupabase()
    .from('leaves')
    .select('id, jours, statut, type, consumes_balance, date_debut, balance_debited')
    .eq('employee_id', employeeId)
    .eq('statut', 'Approuve');
  const { data, error } = await q;
  if (error) {
    // Colonnes snapshot absentes → fallback sans consumes_balance
    const { data: fallback, error: err2 } = await getSupabase()
      .from('leaves')
      .select('id, jours, statut, type, date_debut')
      .eq('employee_id', employeeId)
      .eq('statut', 'Approuve');
    if (err2) throw err2;
    return round2((fallback || [])
      .filter((l) => l.id !== excludeLeaveId)
      .filter((l) => leaveTypeConsumesBalance(l.type))
      .filter((l) => !anneeRef || String(l.date_debut || '').startsWith(String(anneeRef)))
      .reduce((s, l) => s + num(l.jours), 0));
  }
  return round2((data || [])
    .filter((l) => l.id !== excludeLeaveId)
    .filter((l) => l.consumes_balance !== false && leaveTypeConsumesBalance(l.type))
    .filter((l) => !anneeRef || String(l.date_debut || '').startsWith(String(anneeRef)))
    .reduce((s, l) => s + num(l.jours), 0));
}

/**
 * Calcule le bloc droits pour une demande (avant validation).
 */
export async function computeLeaveRightsPreview({
  employee,
  type,
  dateDebut,
  dateFin,
  joursOverride = null,
  excludeLeaveId = null,
} = {}) {
  const anneeRef = num(employee?.conges_annee_ref, new Date().getFullYear()) || new Date().getFullYear();
  const consumes = leaveTypeConsumesBalance(type);
  const wd = await countWorkingDays(dateDebut, dateFin);
  const joursDemandes = joursOverride != null ? num(joursOverride) : wd.days;
  const reliquatAncien = round2(employee?.conges_reliquat);
  const droitAcquis = computeDroitAcquis(employee, anneeRef);
  const joursConsommes = consumes
    ? await sumConsumedApprovedDays(employee?.id, { excludeLeaveId, anneeRef })
    : 0;
  const soldeAvant = round2(reliquatAncien + droitAcquis - joursConsommes);
  const reliquatNouveau = consumes ? round2(soldeAvant - joursDemandes) : soldeAvant;
  const joursTravailles = computeJoursTravailles(employee, anneeRef);

  return {
    consumes,
    anneeRef,
    joursTravailles,
    joursFeries: wd.holidaysInRange.length,
    feriesDetail: (wd.holidayLabels || []).map((h) => `${h.date} (${h.label})`).join(', '),
    holidaysInRange: wd.holidaysInRange,
    reliquatAncien,
    droitAcquis,
    joursConsommes,
    soldeAvant,
    joursDemandes,
    reliquatNouveau,
    depasseSolde: consumes && joursDemandes > soldeAvant + 1e-9,
    regleCalcul: WORKING_DAYS_RULE_LABEL,
  };
}

export function snapshotFieldsFromPreview(preview, { override = false, overrideReason = null, userId = null } = {}) {
  const now = new Date().toISOString();
  return {
    consumes_balance: !!preview.consumes,
    balance_snapshot_at: now,
    snap_jours_travailles: preview.joursTravailles,
    snap_jours_feries: preview.joursFeries,
    snap_reliquat_ancien: preview.reliquatAncien,
    snap_droit_acquis: preview.droitAcquis,
    snap_jours_consommes: preview.joursConsommes,
    snap_solde_disponible: preview.soldeAvant,
    snap_jours_accordes: preview.joursDemandes,
    snap_reliquat_nouveau: preview.reliquatNouveau,
    snap_feries_detail: preview.feriesDetail || null,
    snap_regle_calcul: preview.regleCalcul,
    override_balance: !!override,
    override_by: override ? userId : null,
    override_reason: override ? (overrideReason || 'Validation avec dépassement de solde') : null,
    approved_by: userId,
    approved_at: now,
  };
}

export async function recordBalanceMovement({
  employeeId, leaveId, kind, days, anneeRef, note, userId,
}) {
  try {
    const { error } = await getSupabase()
      .from('leave_balance_movements')
      .insert([{
        employee_id: employeeId,
        leave_id: leaveId,
        kind,
        days,
        annee_ref: anneeRef,
        note: note || null,
        created_by: userId || null,
      }]);
    if (error) {
      // Table absente ou doublon UNIQUE → ignore (idempotent)
      console.warn('[CITYMO] leave_balance_movements', error.message);
    }
  } catch (err) {
    console.warn('[CITYMO] leave_balance_movements', err);
  }
}

/** Applique le reliquat à nouveau sur la fiche salarié après approbation. */
export async function applyEmployeeReliquat(employeeId, reliquatNouveau) {
  if (!employeeId) return;
  const { error } = await getSupabase()
    .from('employees')
    .update({ conges_reliquat: round2(reliquatNouveau) })
    .eq('id', employeeId);
  if (error) {
    console.warn('[CITYMO] applyEmployeeReliquat', error.message);
  }
}

/** Restaure le solde (annulation) : crédite les jours accordés dans le reliquat. */
export async function restoreEmployeeReliquat(employeeId, joursAccordes) {
  if (!employeeId || !joursAccordes) return;
  const { data, error } = await getSupabase()
    .from('employees')
    .select('conges_reliquat')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) {
    console.warn('[CITYMO] restoreEmployeeReliquat select', error.message);
    return;
  }
  const next = round2(num(data?.conges_reliquat) + num(joursAccordes));
  const { error: updErr } = await getSupabase()
    .from('employees')
    .update({ conges_reliquat: next })
    .eq('id', employeeId);
  if (updErr) console.warn('[CITYMO] restoreEmployeeReliquat update', updErr.message);
}
