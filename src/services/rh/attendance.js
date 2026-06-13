/**
 * attendance.js — Présence ouvriers CRUD (Supabase public.attendance)
 */
import { getSupabase } from '../../lib/supabase';
import { WORKER_HOURS_PER_DAY } from './workers';

const TABLE = 'attendance';

export const STANDARD_SHIFT_START = '07:30';
export const STANDARD_SHIFT_END = '17:00';

export const UI_STATUTS = ['Present', 'Absent', 'Retard', 'Demi-journee'];

const UI_TO_DB = {
  Present: 'present',
  Absent: 'absent',
  Retard: 'retard',
  'Demi-journee': 'demi_journee',
};

const DB_TO_UI = {
  present: 'Present',
  absent: 'Absent',
  retard: 'Retard',
  demi_journee: 'Demi-journee',
  conge: 'Absent',
};

export function workerFullName(w) {
  if (!w) return '';
  return [w.prenom, w.nom].filter(Boolean).join(' ').trim();
}

function fmtTime(raw) {
  if (!raw) return '';
  const s = String(raw);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** "HH:MM" → minutes depuis minuit */
export function timeToMinutes(t) {
  if (!t) return null;
  const s = String(t).slice(0, 5);
  const [h, m] = s.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Calcule heures travaillées, retard et équivalent jour (base 8 h).
 * Ex. entrée 08:30, sortie 17:00 → 7 h, retard 1 h, 0,875 j.
 */
export function computeAttendanceWorkMetrics(record = {}) {
  const fullDay = WORKER_HOURS_PER_DAY;
  const statut = record.statut || 'Absent';

  if (statut === 'Absent') {
    return { heuresTravaillees: 0, retardHeures: 0, joursEquivalent: 0 };
  }
  if (statut === 'Demi-journee') {
    const h = round2(fullDay / 2);
    return { heuresTravaillees: h, retardHeures: 0, joursEquivalent: 0.5 };
  }

  const standardStart = timeToMinutes(STANDARD_SHIFT_START);
  const standardEnd = timeToMinutes(STANDARD_SHIFT_END);
  const entry = timeToMinutes(record.heureEntree) ?? standardStart;
  const exit = timeToMinutes(record.heureSortie) ?? standardEnd;
  const effectiveExit = Math.max(entry, Math.min(exit, standardEnd));

  const retardMinutes = Math.max(0, entry - standardStart);
  const retardHeures = round2(retardMinutes / 60);

  let heuresTravaillees;

  if (entry <= standardStart && exit >= standardEnd) {
    heuresTravaillees = fullDay;
  } else if (retardMinutes > 0 && exit >= standardEnd) {
    heuresTravaillees = round2(Math.max(0, fullDay - retardHeures));
  } else {
    const workedMinutes = Math.max(0, effectiveExit - Math.max(entry, standardStart));
    heuresTravaillees = round2(Math.min(fullDay, workedMinutes / 60));
  }

  heuresTravaillees = round2(Math.min(fullDay, Math.max(0, heuresTravaillees)));
  const joursEquivalent = round2(heuresTravaillees / fullDay);

  return { heuresTravaillees, retardHeures, joursEquivalent };
}

function enrichAttendanceMetrics(base) {
  const metrics = computeAttendanceWorkMetrics(base);
  return { ...base, ...metrics };
}

/** DB row → shape Presence.jsx */
export function normalizeAttendance(row) {
  if (!row) return null;
  const w = row.workers;
  const proj = row.projects || w?.projects;
  const projetNom = proj?.nom || row.chantier || w?.chantier || '';
  const resolvedProjectId = row.project_id
    ? String(row.project_id)
    : (w?.project_id ? String(w.project_id) : '');
  return enrichAttendanceMetrics({
    id: row.id,
    workerId: row.worker_id || '',
    ouvrier: workerFullName(w) || row.ouvrier_label || '—',
    projectId: resolvedProjectId,
    workerProjectId: w?.project_id ? String(w.project_id) : resolvedProjectId,
    projet: projetNom,
    date: row.date || '',
    heureEntree: fmtTime(row.heure_entree),
    heureSortie: fmtTime(row.heure_sortie),
    statut: DB_TO_UI[row.statut] || 'Present',
    notes: row.notes || '',
    chefChantierId: row.chef_chantier_id ? String(row.chef_chantier_id) : '',
    chefChantier: row.chef_chantier_nom
      || [row.chef_employee?.firstname, row.chef_employee?.lastname].filter(Boolean).join(' ')
      || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

/** Form UI → DB row */
export function toAttendanceRow(form) {
  const projetLabel = (form.projetNom || form.projet || '').trim();
  return {
    worker_id: form.workerId || null,
    project_id: form.projectId || null,
    date: form.date,
    statut: UI_TO_DB[form.statut] || 'present',
    heure_entree: form.heureEntree || null,
    heure_sortie: form.heureSortie || null,
    chantier: projetLabel || null,
    notes: form.notes?.trim() || null,
    chef_chantier_id: form.chefChantierId || null,
    chef_chantier_nom: (form.chefChantierNom || form.chefChantier || '').trim() || null,
  };
}

const ATTENDANCE_SELECT = `
  *,
  workers ( id, prenom, nom, chantier, project_id, projects ( id, nom, ref ) ),
  projects ( id, nom, ref ),
  chef_employee:employees!attendance_chef_chantier_id_fkey ( id, firstname, lastname, poste )
`;

const ATTENDANCE_SELECT_FALLBACK = `
  *,
  workers ( id, prenom, nom, chantier, project_id ),
  projects ( id, nom, ref )
`;

const ATTENDANCE_SELECT_MINIMAL = '*';

async function fetchAttendanceRows(select) {
  return getSupabase()
    .from(TABLE)
    .select(select)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
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

export async function listAttendance() {
  let { data, error } = await fetchAttendanceRows(ATTENDANCE_SELECT);

  if (error) {
    console.warn('[CITYMO] attendance list (full join)', error.message);
    ({ data, error } = await fetchAttendanceRows(ATTENDANCE_SELECT_FALLBACK));
  }
  if (error) {
    console.warn('[CITYMO] attendance list (fallback)', error.message);
    ({ data, error } = await fetchAttendanceRows(ATTENDANCE_SELECT_MINIMAL));
  }

  if (error) {
    console.error('[CITYMO] attendance list', error);
    throw error;
  }
  return (data || []).map(normalizeAttendance);
}

export async function createAttendance(form) {
  await getAuthUserId();
  const row = toAttendanceRow(form);

  if (!row.worker_id) {
    const err = new Error('Ouvrier requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.date) {
    const err = new Error('Date requise.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.chantier && !row.project_id) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.chef_chantier_id) {
    const err = new Error('Chef de chantier requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(ATTENDANCE_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] attendance insert', error, row);
    throw error;
  }
  return normalizeAttendance(data);
}

export async function updateAttendance(id, form) {
  await getAuthUserId();
  const row = toAttendanceRow(form);

  if (!row.worker_id || !row.date || (!row.chantier && !row.project_id) || !row.chef_chantier_id) {
    const err = new Error('Ouvrier, date, projet et chef de chantier requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(ATTENDANCE_SELECT)
    .single();

  if (error) {
    console.error('[CITYMO] attendance update', error, { id, row });
    throw error;
  }
  return normalizeAttendance(data);
}

export async function deleteAttendance(id) {
  await getAuthUserId();

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] attendance delete', error, { id });
    throw error;
  }
}

export function filterAttendanceRecords(records, filters = {}) {
  const {
    ouvrier = '',
    projet = '',
    projectId = '',
    chefChantierId = '',
    date = '',
    statut = '',
  } = filters;

  return (records || []).filter((r) => {
    if (ouvrier && r.ouvrier !== ouvrier) return false;
    if (chefChantierId && String(r.chefChantierId) !== String(chefChantierId)) return false;
    if (projectId) {
      const pid = String(projectId);
      const match = String(r.projectId) === pid || String(r.workerProjectId) === pid;
      if (!match) return false;
    } else if (projet && r.projet !== projet) return false;
    if (date && r.date !== date) return false;
    if (statut && r.statut !== statut) return false;
    return true;
  });
}

export function filterWorkersForProject(workers, projectId) {
  if (!projectId) return workers || [];
  const pid = String(projectId);
  return (workers || []).filter((w) => String(w.project_id) === pid);
}

export function collectProjectFilterOptions(projects = [], workers = [], records = []) {
  const map = new Map();
  (projects || []).forEach((p) => {
    if (p?.id) map.set(String(p.id), { id: String(p.id), label: p.ref ? `${p.ref} — ${p.nom}` : (p.nom || 'Projet') });
  });
  (workers || []).forEach((w) => {
    if (w.project_id && !map.has(String(w.project_id))) {
      map.set(String(w.project_id), { id: String(w.project_id), label: w.projet_nom || w.chantier || 'Projet' });
    }
  });
  (records || []).forEach((r) => {
    if (r.projectId && !map.has(String(r.projectId))) {
      map.set(String(r.projectId), { id: String(r.projectId), label: r.projet || 'Projet' });
    }
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

export function computeAttendanceStats(records) {
  const list = records || [];
  return {
    present: list.filter((r) => r.statut === 'Present').length,
    absent: list.filter((r) => r.statut === 'Absent').length,
    total: list.length,
  };
}

/** Regroupe les présences par projet + jour (export PDF) */
export function buildAttendanceSheetGroups(records) {
  const map = new Map();
  for (const r of records || []) {
    const date = (r.date || '').toString().slice(0, 10);
    if (!date) continue;
    const projectId = r.projectId ? String(r.projectId) : '';
    const projet = (r.projet || '').trim() || 'Sans projet';
    const key = `${projectId}|${projet}|${date}`;
    if (!map.has(key)) {
      map.set(key, { key, projectId, projet, date, records: [] });
    }
    map.get(key).records.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    return d !== 0 ? d : a.projet.localeCompare(b.projet, 'fr');
  });
}

export function sheetGroupLabel(group) {
  const n = group.records?.length || 0;
  let dateFr = group.date || '';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFr)) {
      dateFr = new Date(`${dateFr}T12:00:00`).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    }
  } catch { /* keep iso */ }
  return `${group.projet} — ${dateFr} (${n} ouvrier${n > 1 ? 's' : ''})`;
}

function groupsMatchingFilters(groups, { projectId, date }) {
  let list = groups;
  if (projectId) {
    const pid = String(projectId);
    list = list.filter((g) => String(g.projectId) === pid);
  }
  if (date) list = list.filter((g) => g.date === date);
  return list;
}

/**
 * Choisit la fiche projet+jour à exporter.
 * @returns {{ group: object|null, ambiguous: boolean, candidates: object[] }}
 */
export function pickSheetGroupForExport(groups, { projectId = '', date = '' } = {}) {
  if (!groups?.length) {
    return { group: null, ambiguous: false, candidates: [] };
  }

  const scoped = groupsMatchingFilters(groups, { projectId, date });

  if (scoped.length === 1) {
    return { group: scoped[0], ambiguous: false, candidates: scoped };
  }

  if (!projectId && !date) {
    if (groups.length === 1) {
      return { group: groups[0], ambiguous: false, candidates: groups };
    }
    return { group: null, ambiguous: true, candidates: groups };
  }

  if (projectId && !date && scoped.length > 0) {
    return {
      group: scoped[0],
      ambiguous: scoped.length > 1,
      candidates: scoped,
    };
  }

  if (date && !projectId) {
    if (scoped.length === 1) {
      return { group: scoped[0], ambiguous: false, candidates: scoped };
    }
    return { group: null, ambiguous: true, candidates: scoped };
  }

  return { group: null, ambiguous: scoped.length > 1, candidates: scoped };
}

export function findSheetGroupForRecord(groups, record) {
  const date = (record?.date || '').toString().slice(0, 10);
  const projectId = record?.projectId ? String(record.projectId) : '';
  const projet = (record?.projet || '').trim();
  return groups.find((g) => g.date === date && (
    (projectId && String(g.projectId) === projectId)
    || g.projet === projet
  ));
}

/** Poids jour équivalent selon statut + horaires (rétrocompat). */
export function attendanceDayWeight(recordOrStatut, maybeRecord) {
  const record = typeof recordOrStatut === 'object' && recordOrStatut !== null
    ? recordOrStatut
    : { statut: recordOrStatut, ...(maybeRecord || {}) };
  return computeAttendanceWorkMetrics(record).joursEquivalent;
}

function matchAttendanceWeekRecord(r, workerId, projectId, weekStart, weekEnd) {
  if (String(r.workerId) !== String(workerId)) return false;
  if (projectId) {
    const pid = String(projectId);
    const match = String(r.projectId) === pid || String(r.workerProjectId) === pid;
    if (!match) return false;
  }
  const d = (r.date || '').slice(0, 10);
  if (!d || d < weekStart || d > weekEnd) return false;
  return true;
}

/** Agrège jours équivalents + heures travaillées depuis les présences chargées. */
export function sumWorkerAttendanceFromRecords(records, workerId, projectId, weekStart, weekEnd) {
  const ws = weekStart;
  const we = weekEnd;
  if (!ws || !we || !workerId) {
    return { joursEquivalent: 0, heuresTravaillees: 0 };
  }

  return (records || []).reduce((acc, r) => {
    if (!matchAttendanceWeekRecord(r, workerId, projectId, ws, we)) return acc;
    const m = computeAttendanceWorkMetrics(r);
    acc.joursEquivalent = round2(acc.joursEquivalent + m.joursEquivalent);
    acc.heuresTravaillees = round2(acc.heuresTravaillees + m.heuresTravaillees);
    return acc;
  }, { joursEquivalent: 0, heuresTravaillees: 0 });
}

/** Compte les jours équivalents travaillés depuis des enregistrements de présence déjà chargés. */
export function countWorkerPaidDaysFromRecords(records, workerId, projectId, weekStart, weekEnd) {
  return sumWorkerAttendanceFromRecords(records, workerId, projectId, weekStart, weekEnd).joursEquivalent;
}

/** Compte les jours travaillés pour un ouvrier sur une semaine (requête directe). */
export async function countWorkerPaidDays(workerId, projectId, weekStart, weekEnd) {
  await getAuthUserId();
  let query = getSupabase()
    .from(TABLE)
    .select('worker_id, project_id, date, statut, heure_entree, heure_sortie, workers ( project_id )')
    .eq('worker_id', workerId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[CITYMO] attendance count days', error);
    throw error;
  }

  return round2((data || []).reduce((sum, row) => {
    if (projectId) {
      const pid = String(projectId);
      const rowPid = row.project_id ? String(row.project_id) : '';
      const workerPid = row.workers?.project_id ? String(row.workers.project_id) : '';
      if (rowPid !== pid && workerPid !== pid) return sum;
    }
    const record = {
      statut: DB_TO_UI[row.statut] || 'Absent',
      heureEntree: fmtTime(row.heure_entree),
      heureSortie: fmtTime(row.heure_sortie),
    };
    return sum + computeAttendanceWorkMetrics(record).joursEquivalent;
  }, 0));
}

/** Lundi ISO pour une date YYYY-MM-DD. */
export function weekStartMonday(isoDate) {
  const d = new Date(`${isoDate || new Date().toISOString().slice(0, 10)}T12:00:00`);
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

export function fmtWeekRange(debut, fin) {
  const d = debut ? new Date(`${debut}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  const f = fin ? new Date(`${fin}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  return `${d} - ${f}`;
}

export function collectAttendanceWeeks(records) {
  const set = new Set();
  (records || []).forEach((r) => {
    if (r.date) set.add(weekStartMonday(r.date));
  });
  return [...set].sort((a, b) => b.localeCompare(a));
}

/** Statut synthétique pour un ensemble de présences journalières. */
export function resolveAttendanceGlobalStatut(lignes = []) {
  const stats = (lignes || []).map((l) => l.statut).filter(Boolean);
  if (!stats.length) return '—';
  if (stats.every((s) => s === 'Absent')) return 'Absent';
  if (stats.some((s) => s === 'Retard')) return 'Retard';
  if (stats.every((s) => s === 'Present')) return 'Present';
  if (stats.every((s) => s === 'Demi-journee')) return 'Demi-journee';
  return 'Mixte';
}

/** Présences journalières d'un ouvrier sur une semaine / projet. */
export function filterAttendanceForWorkerWeek(records, { workerId, projectId, semaineDebut, semaineFin }) {
  const ws = semaineDebut;
  const we = semaineFin || weekEndSunday(semaineDebut);
  if (!ws || !workerId) return [];

  return (records || []).filter((r) => {
    if (String(r.workerId) !== String(workerId)) return false;
    const pid = r.projectId || r.workerProjectId || '';
    if (projectId && String(pid) !== String(projectId)) return false;
    const d = (r.date || '').slice(0, 10);
    if (!d || d < ws || d > we) return false;
    return true;
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** Présences journalières d'un ouvrier sur un projet (toutes semaines). */
export function filterAttendanceForWorkerProject(records, { workerId, projectId }) {
  if (!workerId) return [];
  return (records || []).filter((r) => {
    if (String(r.workerId) !== String(workerId)) return false;
    const pid = r.projectId || r.workerProjectId || '';
    if (projectId && String(pid) !== String(projectId)) return false;
    return Boolean((r.date || '').slice(0, 10));
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** Agrège jours équivalents + heures sur tout un projet (sans filtre semaine). */
export function sumWorkerAttendanceForProject(records, workerId, projectId) {
  if (!workerId) return { joursEquivalent: 0, heuresTravaillees: 0 };
  return (records || []).reduce((acc, r) => {
    const pid = r.projectId || r.workerProjectId || '';
    if (String(r.workerId) !== String(workerId)) return acc;
    if (projectId && String(pid) !== String(projectId)) return acc;
    const m = computeAttendanceWorkMetrics(r);
    acc.joursEquivalent = round2(acc.joursEquivalent + m.joursEquivalent);
    acc.heuresTravaillees = round2(acc.heuresTravaillees + m.heuresTravaillees);
    return acc;
  }, { joursEquivalent: 0, heuresTravaillees: 0 });
}

/** Clé de regroupement récap : worker_id + project_id + lundi de semaine. */
export function attendanceRecapKey(r) {
  if (!r?.workerId || !r?.date) return null;
  const projectId = String(r.projectId || r.workerProjectId || '').trim();
  if (!projectId) return null;
  const weekStart = weekStartMonday(r.date);
  return `${r.workerId}|${projectId}|${weekStart}`;
}

/** Résumé agrégé par ouvrier (projet × ouvrier, ou × semaine si filtre actif). */
export function groupAttendanceByProjectWeekWorker(records, options = {}) {
  const { weekFilter = '', projectIdFilter = '', search = '' } = options;
  const mergeWeeks = !weekFilter;
  const map = new Map();

  for (const r of records || []) {
    if (!r?.workerId || !r?.date) continue;

    const weekStart = weekStartMonday(r.date);
    const pid = String(r.projectId || r.workerProjectId || '').trim();
    if (!pid) continue;

    if (projectIdFilter && pid !== String(projectIdFilter)) continue;
    if (search && !(r.ouvrier || '').toLowerCase().includes(search.toLowerCase())) continue;
    if (weekFilter && weekStart !== weekFilter) continue;

    const recapKey = mergeWeeks
      ? `${r.workerId}|${pid}`
      : `${r.workerId}|${pid}|${weekStart}`;

    if (!map.has(recapKey)) {
      map.set(recapKey, {
        key: recapKey,
        workerId: r.workerId,
        ouvrier: r.ouvrier || '—',
        projectId: pid,
        projet: (r.projet || '').trim() || '—',
        semaineDebut: mergeWeeks ? '' : weekStart,
        semaineFin: mergeWeeks ? '' : weekEndSunday(weekStart),
        chefChantier: '',
        chefCounts: {},
        nbJoursTravailles: 0,
        totalHeures: 0,
        totalRetard: 0,
        joursEquivalent: 0,
        lignes: [],
      });
    }
    const g = map.get(recapKey);
    g.lignes.push(r);
    if ((r.joursEquivalent || 0) > 0) g.nbJoursTravailles += 1;
    g.totalHeures = round2(g.totalHeures + (Number(r.heuresTravaillees) || 0));
    g.totalRetard = round2(g.totalRetard + (Number(r.retardHeures) || 0));
    g.joursEquivalent = round2(g.joursEquivalent + (Number(r.joursEquivalent) || 0));
    const chef = (r.chefChantier || '').trim();
    if (chef) g.chefCounts[chef] = (g.chefCounts[chef] || 0) + 1;
  }

  return [...map.values()].map((g) => {
    const chefs = Object.entries(g.chefCounts).sort((a, b) => b[1] - a[1]);
    g.chefChantier = chefs[0]?.[0] || '';
    g.lignes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (mergeWeeks) {
      const dates = g.lignes.map((l) => l.date).filter(Boolean).sort();
      g.semaineDebut = dates[0] || '';
      g.semaineFin = dates[dates.length - 1] || '';
    }
    g.statutGlobal = resolveAttendanceGlobalStatut(g.lignes);
    g.nbPresences = g.lignes.length;
    delete g.chefCounts;
    return g;
  }).sort((a, b) => {
    const da = a.semaineDebut || '';
    const db = b.semaineDebut || '';
    if (da !== db) return db.localeCompare(da);
    const pa = a.projet || '';
    const pb = b.projet || '';
    if (pa !== pb) return pa.localeCompare(pb, 'fr');
    return (a.ouvrier || '').localeCompare(b.ouvrier || '', 'fr');
  });
}

/** Cartes projet (× semaine si filtre actif) contenant les résumés ouvriers. */
export function groupAttendanceSummariesByProjectWeek(records, options = {}) {
  const { weekFilter = '' } = options;
  const summaries = groupAttendanceByProjectWeekWorker(records, options);
  const map = new Map();

  for (const s of summaries) {
    const key = weekFilter ? `${s.projectId}|${s.semaineDebut}` : String(s.projectId);
    if (!map.has(key)) {
      map.set(key, {
        projectId: s.projectId,
        projet: s.projet,
        semaineDebut: weekFilter ? s.semaineDebut : '',
        semaineFin: weekFilter ? s.semaineFin : '',
        ouvriers: [],
      });
    }
    map.get(key).ouvriers.push(s);
  }

  return [...map.values()].sort((a, b) => {
    const da = a.semaineDebut || '';
    const db = b.semaineDebut || '';
    if (da !== db) return db.localeCompare(da);
    return (a.projet || '').localeCompare(b.projet || '', 'fr');
  });
}

export function collectChantierOptions(workers, records) {
  const set = new Set();
  (workers || []).forEach((w) => { if (w.chantier?.trim()) set.add(w.chantier.trim()); });
  (records || []).forEach((r) => { if (r.projet?.trim()) set.add(r.projet.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
