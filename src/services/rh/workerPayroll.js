/**
 * workerPayroll.js — Paiement hebdomadaire ouvriers (Supabase public.payroll)
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';
import { listAttendance } from './attendance';
import { listOvertime, calcOvertimeAmount } from './overtime';
import { listWorkers } from './workers';

const TABLE = 'payroll';

export const PAYROLL_UI_STATUTS = ['En attente', 'Paye'];

const DB_TO_UI_STATUT = {
  Brouillon: 'En attente',
  Valide: 'En attente',
  'En attente': 'En attente',
  Paye: 'Paye',
};

const UI_TO_DB_STATUT = {
  'En attente': 'En attente',
  Paye: 'Paye',
};

const PAYROLL_SELECT = `
  *,
  workers ( id, prenom, nom, chantier, tarif )
`;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Lundi de la semaine ISO pour une date YYYY-MM-DD. */
export function weekStartMonday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEndSunday(weekStart) {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function currentWeekStart() {
  return weekStartMonday(new Date().toISOString().slice(0, 10));
}

function dayWeightFromAttendance(statut) {
  if (statut === 'Present' || statut === 'Retard') return 1;
  if (statut === 'Demi-journee') return 0.5;
  return 0;
}

export function calcPayrollTotals(fields) {
  const jours = Number(fields.joursPaies) || 0;
  const tarifJour = Number(fields.tarifJour) || 0;
  const heuresSup = Number(fields.heuresSup) || 0;
  const tarifSup = Number(fields.tarifSup) || 0;
  const montantSup = fields.montantSup != null && fields.montantSup !== ''
    ? Number(fields.montantSup)
    : calcOvertimeAmount(heuresSup, tarifSup);
  const avances = Number(fields.avances) || 0;
  const retenues = Number(fields.retenues) || 0;
  const brut = round2(jours * tarifJour + montantSup);
  const net = round2(Math.max(0, brut - avances - retenues));
  return {
    jours_travailles: jours,
    tarif_journalier: tarifJour,
    heures_sup: heuresSup,
    tarif_heures_sup: tarifSup,
    montant_heures_sup: round2(montantSup),
    avances: round2(avances),
    retenues: round2(retenues),
    montant_brut: brut,
    montant_net: net,
  };
}

/** DB row → shape PaiementHebdo.jsx */
export function normalizeWorkerPayroll(row) {
  if (!row) return null;
  const w = row.workers;
  const totals = calcPayrollTotals({
    joursPaies: row.jours_travailles,
    tarifJour: row.tarif_journalier,
    heuresSup: row.heures_sup,
    tarifSup: row.tarif_heures_sup,
    montantSup: row.montant_heures_sup,
    avances: row.avances,
    retenues: row.retenues,
  });
  return {
    id: row.id,
    workerId: row.worker_id || '',
    ouvrier: workerFullName(w) || '—',
    projet: row.chantier || w?.chantier || '',
    semaineDebut: row.semaine_debut || '',
    semaineFin: row.semaine_fin || '',
    joursPaies: Number(row.jours_travailles) || 0,
    tarifJour: Number(row.tarif_journalier) || 0,
    heuresSup: Number(row.heures_sup) || 0,
    tarifSup: Number(row.tarif_heures_sup) || 0,
    montantSup: totals.montant_heures_sup,
    avances: Number(row.avances) || 0,
    retenues: Number(row.retenues) || 0,
    total: Number(row.montant_net) || totals.montant_net,
    montantBrut: Number(row.montant_brut) || totals.montant_brut,
    statut: DB_TO_UI_STATUT[row.statut] || 'En attente',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toWorkerPayrollRow(form) {
  const semaineDebut = form.semaineDebut || currentWeekStart();
  const semaineFin = form.semaineFin || weekEndSunday(semaineDebut);
  const totals = calcPayrollTotals(form);
  return {
    worker_id: form.workerId || null,
    semaine_debut: semaineDebut,
    semaine_fin: semaineFin,
    chantier: form.projet?.trim() || null,
    jours_travailles: totals.jours_travailles,
    tarif_journalier: totals.tarif_journalier,
    heures_sup: totals.heures_sup,
    tarif_heures_sup: totals.tarif_heures_sup,
    montant_heures_sup: totals.montant_heures_sup,
    heures_normales: totals.jours_travailles * 8,
    avances: totals.avances,
    retenues: totals.retenues,
    montant_brut: totals.montant_brut,
    montant_net: totals.montant_net,
    statut: UI_TO_DB_STATUT[form.statut] || 'En attente',
    notes: form.notes?.trim() || null,
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

export async function listWorkerPayroll() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PAYROLL_SELECT)
    .not('worker_id', 'is', null)
    .order('semaine_debut', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CITYMO] workerPayroll list', error);
    throw error;
  }
  return (data || []).map(normalizeWorkerPayroll);
}

export async function createWorkerPayroll(form) {
  await getAuthUserId();
  const row = toWorkerPayrollRow(form);
  if (!row.worker_id) {
    const err = new Error('Ouvrier requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll insert', error, row);
    throw error;
  }
  return normalizeWorkerPayroll(data);
}

export async function updateWorkerPayroll(id, form) {
  await getAuthUserId();
  const row = toWorkerPayrollRow(form);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll update', error, { id, row });
    throw error;
  }
  return normalizeWorkerPayroll(data);
}

export async function updateWorkerPayrollStatut(id, statutUi) {
  await getAuthUserId();
  const statut = UI_TO_DB_STATUT[statutUi] || statutUi;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut })
    .eq('id', id)
    .select(PAYROLL_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] workerPayroll statut', error, { id, statut });
    throw error;
  }
  return normalizeWorkerPayroll(data);
}

export async function deleteWorkerPayroll(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] workerPayroll delete', error, { id });
    throw error;
  }
}

function aggregateWorkerWeek(worker, semaineDebut, semaineFin, attendance, overtime) {
  const inRange = (date) => date >= semaineDebut && date <= semaineFin;
  const workerAtt = attendance.filter((a) => a.workerId === worker.id && inRange(a.date));
  const workerOt = overtime.filter((o) => o.workerId === worker.id && inRange(o.date));

  const joursPaies = round2(
    workerAtt.reduce((s, a) => s + dayWeightFromAttendance(a.statut), 0),
  );
  const heuresSup = round2(workerOt.reduce((s, o) => s + Number(o.heures || 0), 0));
  const montantSup = round2(workerOt.reduce((s, o) => s + Number(o.montant || 0), 0));
  const tarifJour = Number(worker.tarif) || 0;
  const tarifSup = heuresSup > 0 ? round2(montantSup / heuresSup) : round2(tarifJour * 1.25);

  const chantiers = [
    ...new Set([
      ...workerAtt.map((a) => a.projet).filter(Boolean),
      ...workerOt.map((o) => o.projet).filter(Boolean),
      worker.chantier,
    ].filter(Boolean)),
  ];

  if (joursPaies <= 0 && heuresSup <= 0) return null;

  const totals = calcPayrollTotals({
    joursPaies,
    tarifJour,
    heuresSup,
    tarifSup,
    montantSup,
    avances: 0,
    retenues: 0,
  });

  return {
    workerId: worker.id,
    projet: chantiers[0] || worker.chantier || '',
    semaineDebut,
    semaineFin,
    joursPaies,
    tarifJour,
    heuresSup,
    tarifSup,
    montantSup: totals.montant_heures_sup,
    avances: 0,
    retenues: 0,
    statut: 'En attente',
    notes: '',
    ...totals,
  };
}

/** Génère / met à jour les paiements ouvriers depuis présences + heures sup. */
export async function generateWorkerPayrollWeek(semaineDebut) {
  await getAuthUserId();
  const start = semaineDebut || currentWeekStart();
  const end = weekEndSunday(start);

  const [workers, attendance, overtime, existing] = await Promise.all([
    listWorkers(),
    listAttendance(),
    listOvertime(),
    listWorkerPayroll(),
  ]);

  const results = [];
  for (const worker of workers) {
    const agg = aggregateWorkerWeek(worker, start, end, attendance, overtime);
    if (!agg) continue;

    const found = existing.find(
      (p) => p.workerId === worker.id && p.semaineDebut === start,
    );

    if (found) {
      const updated = await updateWorkerPayroll(found.id, {
        workerId: agg.workerId,
        projet: agg.projet,
        semaineDebut: start,
        semaineFin: end,
        joursPaies: agg.joursPaies,
        tarifJour: agg.tarifJour,
        heuresSup: agg.heuresSup,
        tarifSup: agg.tarifSup,
        montantSup: agg.montantSup,
        avances: found.avances,
        retenues: found.retenues,
        statut: found.statut === 'Paye' ? 'Paye' : 'En attente',
        notes: found.notes,
      });
      results.push(updated);
    } else {
      const created = await createWorkerPayroll({
        workerId: agg.workerId,
        projet: agg.projet,
        semaineDebut: start,
        semaineFin: end,
        joursPaies: agg.joursPaies,
        tarifJour: agg.tarifJour,
        heuresSup: agg.heuresSup,
        tarifSup: agg.tarifSup,
        montantSup: agg.montantSup,
        avances: 0,
        retenues: 0,
        statut: 'En attente',
      });
      results.push(created);
    }
  }
  return results;
}

export function filterWorkerPayroll(records, filters = {}) {
  const {
    search = '',
    projet = '',
    semaine = '',
    mois = '',
    statut = '',
  } = filters;

  return (records || []).filter((p) => {
    if (search && !p.ouvrier.toLowerCase().includes(search.toLowerCase())) return false;
    if (projet && p.projet !== projet) return false;
    if (semaine && p.semaineDebut !== semaine) return false;
    if (mois && !String(p.semaineDebut || '').startsWith(mois)) return false;
    if (statut && p.statut !== statut) return false;
    return true;
  });
}

export function computePayrollStats(records) {
  const list = records || [];
  const totalAPayer = list.reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPaye = list.filter((p) => p.statut === 'Paye').reduce((s, p) => s + Number(p.total || 0), 0);
  return {
    totalAPayer,
    totalPaye,
    totalEnAttente: totalAPayer - totalPaye,
    nbEnAttente: list.filter((p) => p.statut === 'En attente').length,
    count: list.length,
  };
}

export function collectPayrollChantiers(workers, records) {
  const set = new Set();
  (workers || []).forEach((w) => { if (w.chantier?.trim()) set.add(w.chantier.trim()); });
  (records || []).forEach((r) => { if (r.projet?.trim()) set.add(r.projet.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function collectPayrollWeeks(records) {
  const set = new Set();
  (records || []).forEach((r) => { if (r.semaineDebut) set.add(r.semaineDebut); });
  return [...set].sort((a, b) => b.localeCompare(a));
}
