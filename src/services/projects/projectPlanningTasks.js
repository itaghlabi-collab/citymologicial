/**
 * projectPlanningTasks.js — Tâches planning chantier (Gantt) par projet
 */
import { getSupabase } from '../../lib/supabase';
import { PLANNING_LOTS } from '../../constants/projectPlanning';

const TABLE = 'project_planning_tasks';

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

export function daysBetweenInclusive(startIso, endIso) {
  if (!startIso || !endIso) return 1;
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff + 1);
}

export function endDateFromStartAndDuration(startIso, dureeJours) {
  if (!startIso) return '';
  const d = new Date(`${startIso}T12:00:00`);
  d.setDate(d.getDate() + Math.max(1, Number(dureeJours) || 1) - 1);
  return isoDateLocal(d);
}

/** Date ISO locale (évite les décalages UTC de toISOString). */
export function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso, days) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + Number(days) || 0);
  return isoDateLocal(d);
}

/**
 * Bornes timeline PDF : min(date début) / max(date fin) sur toutes les tâches.
 * Indépendant de la période affichée à l'écran ou des dates projet.
 */
export function computePdfTimelineBounds(tasks = [], extraRows = []) {
  const all = [...tasks, ...extraRows];
  let minD = '';
  let maxD = '';
  all.forEach((t) => {
    const deb = fmtDate(t.date_debut);
    const fin = fmtDate(t.date_fin) || deb;
    if (deb && (!minD || deb < minD)) minD = deb;
    if (fin && (!maxD || fin > maxD)) maxD = fin;
  });
  if (!minD && !maxD) return { minDate: '', maxDate: '' };
  const minDate = minD || maxD;
  const maxDate = maxD || minD;
  return {
    minDate: addDaysIso(minDate, -2),
    maxDate: addDaysIso(maxDate, 3),
  };
}

function syncTaskDates(form) {
  let date_debut = fmtDate(form.date_debut) || null;
  let date_fin = fmtDate(form.date_fin) || null;
  let duree_jours = Number(form.duree_jours);

  if (date_debut && date_fin) {
    duree_jours = daysBetweenInclusive(date_debut, date_fin);
  } else if (date_debut && duree_jours > 0) {
    date_fin = endDateFromStartAndDuration(date_debut, duree_jours);
  } else if (date_debut && !date_fin) {
    date_fin = date_debut;
    duree_jours = 1;
  } else {
    duree_jours = duree_jours > 0 ? duree_jours : 1;
  }

  return { date_debut, date_fin, duree_jours };
}

export function normalizePlanningTask(row) {
  if (!row) return null;
  const date_debut = fmtDate(row.date_debut);
  const date_fin = fmtDate(row.date_fin);
  const duree = row.duree_jours != null
    ? Number(row.duree_jours)
    : daysBetweenInclusive(date_debut, date_fin);

  return {
    id: row.id,
    project_id: row.project_id,
    nom: row.nom || '',
    lot: row.lot || '',
    date_debut,
    date_fin,
    duree_jours: duree,
    responsable: row.responsable || '',
    avancement: Number(row.avancement ?? 0),
    statut: row.statut || 'a_faire',
    couleur: row.couleur || '',
    notes: row.notes || '',
    predecessor_id: row.predecessor_id || '',
    parent_id: row.parent_id || '',
    ordre: Number(row.ordre ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPlanningTaskRow(form) {
  const dates = syncTaskDates(form);
  return {
    nom: form.nom?.trim() || '',
    lot: emptyToNull(form.lot),
    date_debut: dates.date_debut,
    date_fin: dates.date_fin,
    duree_jours: dates.duree_jours,
    responsable: emptyToNull(form.responsable?.trim()),
    avancement: Math.min(100, Math.max(0, Number(form.avancement) || 0)),
    statut: form.statut || 'a_faire',
    couleur: emptyToNull(form.couleur?.trim()),
    notes: emptyToNull(form.notes?.trim()),
    predecessor_id: emptyToNull(form.predecessor_id),
    parent_id: emptyToNull(form.parent_id),
    ordre: Number(form.ordre) || 0,
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

export async function listProjectPlanningTasks(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('ordre', { ascending: true })
    .order('date_debut', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[CITYMO] project_planning_tasks list', error);
    throw error;
  }
  return (data || []).map(normalizePlanningTask);
}

export async function createProjectPlanningTask(projectId, form) {
  await getAuthUserId();
  const payload = { project_id: projectId, ...toPlanningTaskRow(form) };
  if (!payload.nom) throw new Error('Le nom de la tâche est requis.');
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] project_planning_tasks create', error);
    throw error;
  }
  return normalizePlanningTask(data);
}

export async function updateProjectPlanningTask(id, form) {
  await getAuthUserId();
  const payload = toPlanningTaskRow(form);
  if (!payload.nom) throw new Error('Le nom de la tâche est requis.');
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] project_planning_tasks update', error);
    throw error;
  }
  return normalizePlanningTask(data);
}

export async function deleteProjectPlanningTask(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] project_planning_tasks delete', error);
    throw error;
  }
}

export async function updatePlanningTaskProgress(id, avancement, statut) {
  await getAuthUserId();
  const payload = {
    avancement: Math.min(100, Math.max(0, Number(avancement) || 0)),
  };
  if (statut) payload.statut = statut;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizePlanningTask(data);
}

export async function shiftPlanningTaskDates(id, newStart, newEnd) {
  const form = {
    date_debut: newStart,
    date_fin: newEnd,
    duree_jours: daysBetweenInclusive(newStart, newEnd),
  };
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(form)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizePlanningTask(data);
}

export function filterPlanningTasks(tasks, filters = {}) {
  let rows = [...tasks];
  const { lot, statut, responsable, periodStart, periodEnd } = filters;

  if (lot) rows = rows.filter((t) => t.lot === lot);
  if (statut) rows = rows.filter((t) => t.statut === statut);
  if (responsable) rows = rows.filter((t) => t.responsable === responsable);

  if (periodStart || periodEnd) {
    const ps = periodStart ? new Date(`${periodStart}T00:00:00`) : null;
    const pe = periodEnd ? new Date(`${periodEnd}T23:59:59`) : null;
    rows = rows.filter((t) => {
      if (!t.date_debut && !t.date_fin) return true;
      const start = t.date_debut ? new Date(`${t.date_debut}T00:00:00`) : null;
      const end = t.date_fin ? new Date(`${t.date_fin}T23:59:59`) : start;
      if (ps && end && end < ps) return false;
      if (pe && start && start > pe) return false;
      return true;
    });
  }

  return rows;
}

export function computeTimelineBounds(tasks, project = {}) {
  const dates = [];
  tasks.forEach((t) => {
    if (t.date_debut) dates.push(t.date_debut);
    if (t.date_fin) dates.push(t.date_fin);
  });
  if (project.date_debut) dates.push(fmtDate(project.date_debut));
  if (project.date_fin_prevue) dates.push(fmtDate(project.date_fin_prevue));

  const today = new Date().toISOString().slice(0, 10);
  if (!dates.length) {
    const start = project.date_debut ? fmtDate(project.date_debut) : today;
    const end = endDateFromStartAndDuration(start, 30);
    return { minDate: start, maxDate: end };
  }

  dates.sort();
  let minDate = dates[0];
  let maxDate = dates[dates.length - 1];

  const minD = new Date(`${minDate}T12:00:00`);
  minD.setDate(minD.getDate() - 3);
  const maxD = new Date(`${maxDate}T12:00:00`);
  maxD.setDate(maxD.getDate() + 7);

  return {
    minDate: minD.toISOString().slice(0, 10),
    maxDate: maxD.toISOString().slice(0, 10),
  };
}

export function buildTimelineColumns(minDate, maxDate) {
  const cols = [];
  const start = new Date(`${minDate}T12:00:00`);
  const end = new Date(`${maxDate}T12:00:00`);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const useWeeks = totalDays > 60;

  if (useWeeks) {
    const d = new Date(start);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    while (d <= end) {
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 6);
      cols.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        sub: `S${getWeekNumber(d)}`,
        start: new Date(d),
        end: weekEnd > end ? end : weekEnd,
        unit: 'week',
      });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(start);
    while (d <= end) {
      const isMonday = d.getDay() === 1;
      cols.push({
        key: d.toISOString().slice(0, 10),
        label: d.getDate().toString(),
        sub: isMonday ? d.toLocaleDateString('fr-FR', { month: 'short' }) : '',
        start: new Date(d),
        end: new Date(d),
        unit: 'day',
      });
      d.setDate(d.getDate() + 1);
    }
  }
  return cols;
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

export function taskBarMetrics(task, minDate, maxDate) {
  if (!task.date_debut) return null;
  const t0 = new Date(`${minDate}T00:00:00`).getTime();
  const t1 = new Date(`${maxDate}T23:59:59`).getTime();
  const span = Math.max(1, t1 - t0);
  const start = new Date(`${task.date_debut}T00:00:00`).getTime();
  const end = new Date(`${(task.date_fin || task.date_debut)}T23:59:59`).getTime();
  const left = ((start - t0) / span) * 100;
  const width = ((end - start) / span) * 100;
  return {
    left: Math.max(0, Math.min(100, left)),
    width: Math.max(0.8, Math.min(100 - left, width + 0.2)),
  };
}

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Colonnes jour par jour pour en-tête Gantt classique */
export function buildDailyTimeline(minDate, maxDate) {
  const days = [];
  const d = new Date(`${minDate}T12:00:00`);
  const end = new Date(`${maxDate}T12:00:00`);
  while (d <= end) {
    const dow = d.getDay();
    days.push({
      key: d.toISOString().slice(0, 10),
      date: new Date(d),
      day: d.getDate(),
      letter: DAY_LETTERS[dow],
      isWeekend: dow === 0 || dow === 6,
      month: d.getMonth(),
      year: d.getFullYear(),
    });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Regroupement mois pour la 1ère ligne d'en-tête */
export function buildMonthGroups(days) {
  const groups = [];
  let current = null;
  days.forEach((day, i) => {
    const label = day.date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    if (!current || current.month !== day.month || current.year !== day.year) {
      current = { label, month: day.month, year: day.year, startIdx: i, span: 1 };
      groups.push(current);
    } else {
      current.span += 1;
    }
  });
  return groups;
}

/** Position barre en pixels (timeline fixe jour/jour) */
export function taskBarPx(task, minDate, dayWidth) {
  if (!task.date_debut) return null;
  const t0 = new Date(`${minDate}T12:00:00`);
  const start = new Date(`${task.date_debut}T12:00:00`);
  const startOffset = Math.round((start - t0) / 86400000);
  const duration = daysBetweenInclusive(task.date_debut, task.date_fin || task.date_debut);
  return {
    left: startOffset * dayWidth,
    width: Math.max(dayWidth * 0.6, duration * dayWidth - 2),
    startOffset,
    duration,
  };
}


/** Lignes affichage : résumé par lot + sous-tâches (style WBS) */
export function buildGanttDisplayRows(tasks, collapsedLots = new Set()) {
  const byLot = {};
  tasks.forEach((t) => {
    const lot = t.lot || 'Autre';
    if (!byLot[lot]) byLot[lot] = [];
    byLot[lot].push(t);
  });

  const lotOrder = [...PLANNING_LOTS.filter((l) => byLot[l]), ...Object.keys(byLot).filter((l) => !PLANNING_LOTS.includes(l))];
  const rows = [];
  let idx = 0;

  lotOrder.forEach((lot) => {
    const lotTasks = byLot[lot];
    if (!lotTasks?.length) return;
    idx += 1;
    const starts = lotTasks.map((t) => t.date_debut).filter(Boolean).sort();
    const ends = lotTasks.map((t) => t.date_fin || t.date_debut).filter(Boolean).sort();
    const deb = starts[0] || '';
    const fin = ends[ends.length - 1] || '';
    const avg = lotTasks.reduce((s, t) => s + Number(t.avancement || 0), 0) / lotTasks.length;

    rows.push({
      type: 'summary',
      id: `summary-${lot}`,
      wbs: String(idx),
      nom: lot,
      lot,
      date_debut: deb,
      date_fin: fin,
      duree_jours: deb && fin ? daysBetweenInclusive(deb, fin) : 0,
      avancement: Math.round(avg),
      statut: 'en_cours',
      collapsed: collapsedLots.has(lot),
      childCount: lotTasks.length,
    });

    if (!collapsedLots.has(lot)) {
      lotTasks.forEach((t, i) => {
        rows.push({
          type: 'task',
          ...t,
          wbs: `${idx}.${i + 1}`,
          indent: 1,
        });
      });
    }
  });

  return rows;
}

/** Arbre WBS à partir des tâches (parent_id) */
export function buildWbsTree(tasks) {
  const nodes = {};
  tasks.forEach((t) => {
    nodes[t.id] = { ...t, children: [] };
  });
  const roots = [];
  tasks.forEach((t) => {
    const node = nodes[t.id];
    if (t.parent_id && nodes[t.parent_id]) {
      nodes[t.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });

  function assignWbs(list, prefix = '') {
    list.forEach((node, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      node.wbs = wbs;
      if (node.children.length) assignWbs(node.children, wbs);
    });
  }
  assignWbs(roots);
  return roots;
}

/** Liste aplatie WBS pour affichage */
export function flattenWbsTree(roots, collapsed = new Set()) {
  const rows = [];
  function walk(list, depth = 0) {
    list.forEach((node) => {
      rows.push({ ...node, depth, hasChildren: node.children.length > 0 });
      if (node.children.length && !collapsed.has(node.id)) {
        walk(node.children, depth + 1);
      }
    });
  }
  walk(roots);
  return rows;
}
