/**
 * projectPlanningPdf.js — Export PDF planning Gantt (1 page, timeline condensée)
 */
import { jsPDF } from 'jspdf';
import { planningLotColor, planningTaskBarColor } from '../../constants/projectPlanning';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import {
  buildGanttDisplayRows,
  computePdfTimelineBounds,
  daysBetweenInclusive,
  isoDateLocal,
  addDaysIso,
} from './projectPlanningTasks';

const RED = [198, 40, 40];
const BLACK = [33, 33, 33];
const MUTED = [110, 110, 110];
const BORDER = [200, 200, 200];
const HEADER_BG = [248, 248, 248];
const GRID = [230, 230, 230];
const DEP_COLOR = [90, 90, 90];
const CRITICAL = [198, 40, 40];
const PROGRESS = [46, 125, 50];

const M = 10;
const LEFT_W = 98;
const HEADER_BLOCK_H = 38;
const CAL_H = 17;
const FOOTER_H = 7;
const MIN_ROW_H = 4;
const MAX_ROW_H = 7;

const FORMATS = {
  a3: { w: 420, h: 297, name: 'a3' },
  a2: { w: 594, h: 420, name: 'a2' },
};

const LEFT_COLS = [
  { key: 'wbs', label: 'WBS', w: 9 },
  { key: 'nom', label: 'Tâche', w: 30 },
  { key: 'duree', label: 'Dur.', w: 10 },
  { key: 'debut', label: 'Début', w: 17 },
  { key: 'fin', label: 'Fin', w: 17 },
  { key: 'avancement', label: 'Av. %', w: 13 },
];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function fmtDateBar(d, full = false) {
  if (!d) return '';
  try {
    const opts = full
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : { day: '2-digit', month: '2-digit' };
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', opts);
  } catch {
    return String(d);
  }
}

function fmtDateShort(d) {
  if (!d) return '';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch {
    return String(d);
  }
}

function fmtMonthShort(d) {
  if (!d) return '';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  } catch {
    return '';
  }
}

function hexToRgb(hex) {
  const h = (hex || '#757575').replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function globalAvancement(projet, tasks) {
  if (projet?.avancement != null && Number(projet.avancement) > 0) {
    return Math.round(Number(projet.avancement));
  }
  if (!tasks.length) return 0;
  const sum = tasks.reduce((s, t) => s + Number(t.avancement || 0), 0);
  return Math.round(sum / tasks.length);
}

function projectSpan(tasks, projet = {}) {
  const dates = [];
  tasks.forEach((t) => {
    if (t.date_debut) dates.push(t.date_debut);
    if (t.date_fin) dates.push(t.date_fin);
  });
  if (projet.date_debut) dates.push(String(projet.date_debut).slice(0, 10));
  if (projet.date_fin_prevue) dates.push(String(projet.date_fin_prevue).slice(0, 10));
  if (!dates.length) {
    const start = projet.date_debut ? String(projet.date_debut).slice(0, 10) : '';
    return { start, end: start, totalDays: 0 };
  }
  dates.sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  return { start, end, totalDays: daysBetweenInclusive(start, end) };
}

function periodLabel(minDate, maxDate) {
  return `${fmtDate(minDate)} → ${fmtDate(maxDate)}`;
}

function taskDuration(t) {
  return Math.max(1, Number(t.duree_jours) || daysBetweenInclusive(t.date_debut, t.date_fin || t.date_debut));
}

/** Chemin critique (CPM) — calcul PDF uniquement, sans modifier le Gantt. */
export function computeCriticalPathIds(tasks = []) {
  const valid = tasks.filter((t) => t.id && t.date_debut);
  if (!valid.length) return new Set();

  const ids = new Set(valid.map((t) => t.id));
  const anchor = valid.map((t) => t.date_debut).sort()[0];
  const dayIdx = (iso) => {
    const a = new Date(`${anchor}T12:00:00`);
    const b = new Date(`${iso}T12:00:00`);
    return Math.round((b - a) / 86400000);
  };

  const ES = new Map();
  const EF = new Map();
  valid.forEach((t) => {
    ES.set(t.id, dayIdx(t.date_debut));
    EF.set(t.id, ES.get(t.id) + taskDuration(t) - 1);
  });

  let changed = true;
  while (changed) {
    changed = false;
    valid.forEach((t) => {
      if (!t.predecessor_id || !ids.has(t.predecessor_id)) return;
      const newES = EF.get(t.predecessor_id) + 1;
      if (newES > ES.get(t.id)) {
        ES.set(t.id, newES);
        EF.set(t.id, newES + taskDuration(t) - 1);
        changed = true;
      }
    });
  }

  const projectEnd = Math.max(...valid.map((t) => EF.get(t.id)));
  const LF = new Map();
  const LS = new Map();
  valid.forEach((t) => {
    LF.set(t.id, projectEnd);
    LS.set(t.id, LF.get(t.id) - taskDuration(t) + 1);
  });

  const successors = {};
  valid.forEach((t) => {
    if (t.predecessor_id && ids.has(t.predecessor_id)) {
      if (!successors[t.predecessor_id]) successors[t.predecessor_id] = [];
      successors[t.predecessor_id].push(t.id);
    }
  });

  changed = true;
  while (changed) {
    changed = false;
    valid.forEach((t) => {
      const succs = successors[t.id] || [];
      if (!succs.length) return;
      const minLS = Math.min(...succs.map((sid) => LS.get(sid))) - 1;
      const newLF = minLS + taskDuration(t) - 1;
      if (newLF < LF.get(t.id)) {
        LF.set(t.id, newLF);
        LS.set(t.id, newLF - taskDuration(t) + 1);
        changed = true;
      }
    });
  }

  const critical = new Set();
  valid.forEach((t) => {
    if (ES.get(t.id) === LS.get(t.id)) critical.add(t.id);
  });
  return critical;
}

function isSummaryCritical(row, tasks, criticalIds) {
  const lot = row.lot || row.nom;
  return tasks.some((t) => (t.lot || 'Autre') === lot && criticalIds.has(t.id));
}

function visiblePctLabel(pct) {
  const r = Math.round(pct);
  if (r <= 0) return '';
  if (r >= 88) return '100%';
  if (r >= 63) return '75%';
  if (r >= 38) return '50%';
  if (r >= 13) return '25%';
  return `${r}%`;
}

function barLuminance(rgb) {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

function barContrastTextColor(rgb) {
  return barLuminance(rgb) > 0.62 ? BLACK : [255, 255, 255];
}

function measureTextWidth(doc, text, fontSize) {
  doc.setFontSize(fontSize);
  return doc.getTextWidth(String(text || ''));
}

/** Échelle temporelle : jours / semaines / mois selon la durée totale. */
export function buildPdfGanttScale(minDate, maxDate, ganttWidth) {
  const totalDays = daysBetweenInclusive(minDate, maxDate);

  if (totalDays <= 45) {
    const cols = [];
    const d = new Date(`${minDate}T12:00:00`);
    const end = new Date(`${maxDate}T12:00:00`);
    while (d <= end) {
      const iso = isoDateLocal(d);
      const showMonth = d.getDate() === 1 || cols.length === 0;
      cols.push({
        start: iso,
        end: iso,
        label: String(d.getDate()),
        subLabel: showMonth ? fmtMonthShort(iso) : '',
        unit: 'day',
      });
      d.setDate(d.getDate() + 1);
    }
    return { unit: 'day', cols, totalDays, ganttWidth };
  }

  if (totalDays <= 180) {
    const cols = [];
    const d = new Date(`${minDate}T12:00:00`);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const end = new Date(`${maxDate}T12:00:00`);
    while (d <= end) {
      const start = isoDateLocal(d);
      const wEnd = new Date(d);
      wEnd.setDate(wEnd.getDate() + 6);
      const weekEndIso = wEnd > end ? maxDate : isoDateLocal(wEnd);
      cols.push({
        start,
        end: weekEndIso,
        label: fmtDateShort(start),
        subLabel: fmtDateBar(start),
        unit: 'week',
      });
      d.setDate(d.getDate() + 7);
    }
    if (cols.length && cols[cols.length - 1].end < maxDate) {
      const lastStart = addDaysIso(cols[cols.length - 1].end, 1);
      cols.push({
        start: lastStart,
        end: maxDate,
        label: fmtDateShort(lastStart),
        subLabel: fmtDateBar(lastStart),
        unit: 'week',
      });
    }
    return { unit: 'week', cols, totalDays, ganttWidth };
  }

  const cols = [];
  const d0 = new Date(`${minDate}T12:00:00`);
  d0.setDate(1);
  const end = new Date(`${maxDate}T12:00:00`);
  const d = new Date(d0);
  while (d <= end) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const mStartIso = isoDateLocal(new Date(y, m, 1));
    const mEndIso = isoDateLocal(new Date(y, m + 1, 0));
    const start = mStartIso < minDate ? minDate : mStartIso;
    const mend = mEndIso > maxDate ? maxDate : mEndIso;
    cols.push({
      start,
      end: mend,
      label: fmtMonthShort(start),
      subLabel: fmtDateBar(start),
      unit: 'month',
    });
    d.setMonth(m + 1);
  }
  if (cols.length && cols[cols.length - 1].end < maxDate) {
    cols.push({
      start: addDaysIso(cols[cols.length - 1].end, 1),
      end: maxDate,
      label: fmtMonthShort(maxDate),
      subLabel: fmtDateBar(maxDate),
      unit: 'month',
    });
  }
  return { unit: 'month', cols, totalDays, ganttWidth };
}

/** Position proportionnelle d'une barre sur la timeline globale. */
export function taskBarProportional(task, minDate, maxDate, ganttX, ganttW) {
  if (!task?.date_debut) return null;
  const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
  const winStart = new Date(`${minDate}T12:00:00`);
  const winEnd = new Date(`${maxDate}T12:00:00`);
  const tStart = new Date(`${task.date_debut}T12:00:00`);
  const tEnd = new Date(`${(task.date_fin || task.date_debut)}T12:00:00`);
  if (tEnd < winStart || tStart > winEnd) return null;

  const visStart = tStart < winStart ? winStart : tStart;
  const visEnd = tEnd > winEnd ? winEnd : tEnd;
  const offsetDays = Math.max(0, Math.round((visStart - winStart) / 86400000));
  const durDays = Math.max(
    1,
    task.type === 'milestone' ? 1 : Math.round((visEnd - visStart) / 86400000) + 1,
  );

  const x = ganttX + (offsetDays / totalDays) * ganttW;
  const minW = task.type === 'milestone' ? 0.8 : 1.2;
  const w = Math.max((durDays / totalDays) * ganttW, minW);
  return { x: x + 0.2, w: Math.max(w - 0.4, 0.6), endX: x + w, centerX: x + w / 2 };
}

function buildMilestonePdfRows(milestones = []) {
  return (milestones || []).map((m, i) => ({
    type: 'milestone',
    id: m.id || `milestone-${i}`,
    nom: m.nom || 'Jalon',
    wbs: '◆',
    lot: 'Jalon',
    date_debut: m.date_jalon,
    date_fin: m.date_jalon,
    duree_jours: 0,
    avancement: m.statut === 'atteint' ? 100 : 0,
    responsable: '',
  }));
}

function buildPdfRows(tasks, mode, milestones = []) {
  const rows = buildGanttDisplayRows(tasks, new Set());
  const base = mode === 'synthesis' ? rows.filter((r) => r.type === 'summary') : rows;
  const msRows = buildMilestonePdfRows(milestones);
  return msRows.length ? [...base, ...msRows] : base;
}

function pickPageLayout(rowCount) {
  for (const key of ['a3', 'a2']) {
    const fmt = FORMATS[key];
    const bodyH = fmt.h - HEADER_BLOCK_H - CAL_H - FOOTER_H - M;
    const rowH = bodyH / Math.max(1, rowCount);
    if (rowH >= MIN_ROW_H) {
      return {
        format: fmt.name,
        pageW: fmt.w,
        pageH: fmt.h,
        rowH: Math.min(MAX_ROW_H, rowH),
        ganttX: M + LEFT_W,
        ganttW: fmt.w - M * 2 - LEFT_W,
        bodyBottom: fmt.h - FOOTER_H - 2,
      };
    }
  }
  const fmt = FORMATS.a2;
  return {
    format: fmt.name,
    pageW: fmt.w,
    pageH: fmt.h,
    rowH: MIN_ROW_H,
    ganttX: M + LEFT_W,
    ganttW: fmt.w - M * 2 - LEFT_W,
    bodyBottom: fmt.h - FOOTER_H - 2,
  };
}

function fileSlug(projet, mode) {
  const ref = (projet?.ref || projet?.id || 'projet').replace(/\s+/g, '-');
  return mode === 'synthesis' ? `planning-synthese-${ref}` : `planning-detail-${ref}`;
}

function drawHeader(doc, layout, { logo, projet, mode, minDate, maxDate, projectDates }) {
  const { pageW } = layout;
  const y0 = M;

  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, 'PNG', M, y0, logo.w, logo.h);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...RED);
    doc.text('CITYMO', M, y0 + 8);
  }

  const tx = M + (logo?.w || 0) + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text(projet.nom || 'Projet', tx, y0 + 5);

  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const client = projet.client || projet.client_nom || '—';
  const avancement = globalAvancement(projet, projet._tasksForPdf || []);
  const span = projectDates || { start: minDate, end: maxDate, totalDays: daysBetweenInclusive(minDate, maxDate) };
  [
    `Client : ${client}`,
    `Réf. ${projet.ref || '—'}`,
    `Durée totale projet : ${span.totalDays || '—'} jours`,
    `Date début projet : ${fmtDate(span.start)}`,
    `Date fin projet : ${fmtDate(span.end)}`,
    `Planning affiché : ${periodLabel(minDate, maxDate)} · Avancement ${avancement}%`,
    `Édité le ${new Date().toLocaleDateString('fr-FR')}`,
  ].forEach((line, i) => {
    doc.text(line, tx, y0 + 10 + i * 3.2);
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  const modeLabel = mode === 'synthesis' ? 'Planning synthèse — 1 page' : 'Planning détaillé — 1 page';
  doc.text(modeLabel, pageW - M, y0 + 6, { align: 'right' });

  const lineY = y0 + HEADER_BLOCK_H - 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(M, lineY, pageW - M, lineY);
  return lineY + 2;
}

function colCenterX(col, minDate, maxDate, ganttX, ganttW) {
  const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
  const winStart = new Date(`${minDate}T12:00:00`);
  const cStart = new Date(`${col.start}T12:00:00`);
  const offset = Math.max(0, Math.round((cStart - winStart) / 86400000));
  const colDays = daysBetweenInclusive(col.start, col.end);
  const x0 = ganttX + (offset / totalDays) * ganttW;
  const w = (colDays / totalDays) * ganttW;
  return x0 + w / 2;
}

function colStartX(col, minDate, maxDate, ganttX, ganttW) {
  const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
  const winStart = new Date(`${minDate}T12:00:00`);
  const cStart = new Date(`${col.start}T12:00:00`);
  const offset = Math.max(0, Math.round((cStart - winStart) / 86400000));
  return ganttX + (offset / totalDays) * ganttW;
}

function drawColumnHeaders(doc, layout, scale, minDate, maxDate) {
  const { ganttX, ganttW, pageW } = layout;
  const calTop = M + HEADER_BLOCK_H;
  const calBot = calTop + CAL_H;

  doc.setFillColor(...HEADER_BG);
  doc.rect(M, calTop, LEFT_W, CAL_H, 'F');
  doc.setDrawColor(...BORDER);
  doc.rect(M, calTop, LEFT_W, CAL_H);

  let x = M + 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(...MUTED);
  LEFT_COLS.forEach((c) => {
    doc.text(c.label, x, calBot - 2.5);
    x += c.w;
  });

  doc.setFillColor(...HEADER_BG);
  doc.rect(ganttX, calTop, ganttW, CAL_H, 'F');
  doc.rect(ganttX, calTop, ganttW, CAL_H);

  scale.cols.forEach((col) => {
    const cx = colCenterX(col, minDate, maxDate, ganttX, ganttW);
    const gx = colStartX(col, minDate, maxDate, ganttX, ganttW);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...BLACK);
    doc.text(col.label, cx, calTop + 5.5, { align: 'center' });
    if (col.subLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.5);
      doc.setTextColor(...MUTED);
      doc.text(col.subLabel, cx, calTop + 9.5, { align: 'center' });
    }
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.12);
    doc.line(gx, calTop, gx, layout.bodyBottom);
  });

  doc.setDrawColor(...BORDER);
  doc.line(ganttX, calBot, pageW - M, calBot);
  return calBot + 1;
}

function drawGanttGrid(doc, layout, scale, minDate, maxDate, startY) {
  const { ganttX, ganttW, pageW, bodyBottom } = layout;
  doc.setDrawColor(...BORDER);
  doc.line(ganttX, startY, ganttX, bodyBottom);
  doc.line(pageW - M, startY, pageW - M, bodyBottom);

  scale.cols.forEach((col) => {
    const gx = colStartX(col, minDate, maxDate, ganttX, ganttW);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.1);
    doc.line(gx, startY, gx, bodyBottom);
  });
}

function drawDiamond(doc, cx, cy, r) {
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.triangle(cx, cy - r, cx + r, cy, cx, cy + r, 'F');
  doc.triangle(cx, cy - r, cx - r, cy, cx, cy + r, 'F');
}

function drawBarProgress(doc, bar, barY, barH, pct) {
  if (pct <= 0 || pct >= 100) return;
  doc.setFillColor(...PROGRESS);
  const h = Math.max(1.2, barH * 0.42);
  doc.rect(bar.x, barY + barH - h, (bar.w * pct) / 100, h, 'F');
}

function drawBarPctLabel(doc, bar, barY, barH, pct, dateMeta) {
  const label = visiblePctLabel(pct);
  if (!label || pct <= 0 || bar.w < 14) return;

  const fs = bar.w >= 36 ? 5.5 : 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fs);
  const pctW = measureTextWidth(doc, label, fs);

  if (dateMeta?.placement === 'inside' || dateMeta?.placement === 'inside-long') {
    const centerGap = bar.w - (dateMeta.startPad || 0) - (dateMeta.endPad || 0);
    if (centerGap < pctW + 4 || bar.w < 28) return;
    doc.setTextColor(255, 255, 255);
    doc.text(label, bar.x + bar.w / 2, barY + barH / 2 - 0.2, { align: 'center' });
    return;
  }

  if (bar.w < 20) return;
  doc.setTextColor(255, 255, 255);
  doc.text(label, bar.x + bar.w / 2, barY + barH / 2 - 0.2, { align: 'center' });
}

function drawBarDateLabels(doc, bar, row, barY, barH, barRgb) {
  const start = row.date_debut;
  const end = row.date_fin || row.date_debut;
  if (!start || !bar) return null;

  const startShort = fmtDateBar(start, false);
  const endShort = fmtDateBar(end, false);
  const startLong = `Début : ${fmtDate(start)}`;
  const endLong = `Fin : ${fmtDate(end)}`;
  const y = barY + barH - 1;

  doc.setFont('helvetica', 'bold');

  if (bar.w >= 46) {
    const fs = 4.8;
    doc.setFontSize(fs);
    const wStart = measureTextWidth(doc, startLong, fs);
    const wEnd = measureTextWidth(doc, endLong, fs);
    if (wStart + wEnd + 6 <= bar.w) {
      const tc = barContrastTextColor(barRgb);
      doc.setTextColor(...tc);
      doc.text(startLong, bar.x + 1.4, y);
      doc.text(endLong, bar.x + bar.w - 1.4, y, { align: 'right' });
      return { placement: 'inside-long', startPad: wStart + 1.4, endPad: wEnd + 1.4 };
    }
  }

  const fs = bar.w >= 30 ? 5 : 4.6;
  doc.setFontSize(fs);
  const wStart = measureTextWidth(doc, startShort, fs);
  const wEnd = measureTextWidth(doc, endShort, fs);
  const pad = 1.2;
  const gap = 3;

  if (bar.w >= 16 && wStart + wEnd + gap <= bar.w) {
    const tc = barContrastTextColor(barRgb);
    doc.setTextColor(...tc);
    doc.text(startShort, bar.x + pad, y);
    doc.text(endShort, bar.x + bar.w - pad, y, { align: 'right' });
    return { placement: 'inside', startPad: wStart + pad, endPad: wEnd + pad };
  }

  doc.setFontSize(4.6);
  doc.setTextColor(...BLACK);
  doc.text(startShort, bar.x - 0.4, y, { align: 'right' });
  doc.text(endShort, bar.x + bar.w + 0.4, y, { align: 'left' });
  return { placement: 'outside', startPad: 0, endPad: 0 };
}

function drawSummaryBar(doc, bar, barY, barH, rgb) {
  doc.setFillColor(...rgb);
  doc.setDrawColor(...rgb);
  const h = Math.max(2, barH * 0.55);
  const y = barY + (barH - h) / 2;
  const cap = Math.min(2.5, h / 2);
  doc.rect(bar.x + cap, y, Math.max(bar.w - cap * 2, 1), h, 'F');
  doc.triangle(bar.x, y + h / 2, bar.x + cap, y, bar.x + cap, y + h, 'F');
  doc.triangle(bar.x + bar.w, y + h / 2, bar.x + bar.w - cap, y, bar.x + bar.w - cap, y + h, 'F');
}

function drawRow(doc, layout, row, y, minDate, maxDate, rowH, criticalIds, tasks) {
  const { ganttX, ganttW, pageW } = layout;
  const isSummary = row.type === 'summary';
  const isMilestone = row.type === 'milestone';
  const pct = Math.min(100, Math.max(0, Number(row.avancement) || 0));

  doc.setFillColor(isSummary ? 245 : 255, isSummary ? 245 : 255, isSummary ? 245 : 255);
  doc.rect(M, y, LEFT_W + ganttW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.12);
  doc.line(M, y + rowH, pageW - M, y + rowH);

  let x = M + 1;
  const nom = row.nom || '—';
  const nomLines = doc.splitTextToSize(nom, LEFT_COLS[1].w - 2);
  const fontSize = isSummary ? Math.min(7, rowH - 1) : Math.min(6.5, rowH - 1);

  doc.setFont('helvetica', isSummary || isMilestone ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...BLACK);

  doc.text(String(row.wbs || ''), x, y + rowH - 1.8);
  x += LEFT_COLS[0].w;
  doc.text(nomLines.slice(0, 1), x, y + rowH - 1.8);
  x += LEFT_COLS[1].w;
  doc.text(row.duree_jours ? `${row.duree_jours}j` : (isMilestone ? '0j' : '—'), x, y + rowH - 1.8);
  x += LEFT_COLS[2].w;
  doc.text(fmtDate(row.date_debut), x, y + rowH - 1.8);
  x += LEFT_COLS[3].w;
  doc.text(fmtDate(row.date_fin), x, y + rowH - 1.8);
  x += LEFT_COLS[4].w;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(pct >= 100 ? 46 : 125, pct >= 100 ? 125 : 50, pct > 0 && pct < 100 ? 50 : 46);
  doc.text(isMilestone && pct >= 100 ? '100%' : (pct > 0 ? `${Math.round(pct)}%` : '—'), x, y + rowH - 1.8);

  const bar = taskBarProportional(row, minDate, maxDate, ganttX, ganttW);
  if (!bar) return { bar: null, rowCenterY: y + rowH / 2 };

  const barY = y + 1.1;
  const barH = Math.max(1.8, rowH - 2);

  if (isMilestone) {
    drawDiamond(doc, bar.centerX, y + rowH / 2, Math.min(2.8, barH / 2 + 0.5));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(...BLACK);
    doc.text(fmtDateBar(row.date_debut, true), bar.centerX, barY - 0.5, { align: 'center' });
    return { bar, barY, barH, rowCenterY: y + rowH / 2 };
  }

  const isCritical = isSummary
    ? isSummaryCritical(row, tasks, criticalIds)
    : (row.id && criticalIds.has(row.id));
  const rgb = isCritical ? CRITICAL : hexToRgb(planningTaskBarColor(row));

  if (isSummary) {
    drawSummaryBar(doc, bar, barY, barH, rgb);
  } else {
    doc.setFillColor(...rgb);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(bar.x, barY, bar.w, barH, 0.6, 0.6, 'F');
    } else {
      doc.rect(bar.x, barY, bar.w, barH, 'F');
    }
  }

  drawBarProgress(doc, bar, barY, barH, pct);
  const dateMeta = drawBarDateLabels(doc, bar, row, barY, barH, rgb);
  drawBarPctLabel(doc, bar, barY, barH, pct, dateMeta);

  return { bar, barY, barH, rowCenterY: y + rowH / 2 };
}

function drawDependencies(doc, rowMetrics) {
  doc.setDrawColor(...DEP_COLOR);
  doc.setLineWidth(0.25);

  rowMetrics.forEach((metric) => {
    const row = metric.row;
    if (row.type !== 'task' || !row.predecessor_id || !metric.bar) return;
    const predMetric = rowMetrics.find((m) => m.row.id === row.predecessor_id);
    if (!predMetric?.bar) return;

    const x1 = predMetric.bar.x + predMetric.bar.w;
    const y1 = predMetric.rowCenterY;
    const x2 = metric.bar.x;
    const y2 = metric.rowCenterY;
    const midX = x1 + Math.max(2, (x2 - x1) / 2);

    doc.line(x1, y1, midX, y1);
    doc.line(midX, y1, midX, y2);
    doc.line(midX, y2, x2, y2);
    doc.line(x2 - 1.2, y2 - 0.8, x2, y2);
    doc.line(x2 - 1.2, y2 + 0.8, x2, y2);
  });
}

function drawLegend(doc, layout) {
  const y = layout.pageH - FOOTER_H - 3.5;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setFillColor(...CRITICAL);
  doc.rect(M, y - 2, 4, 2, 'F');
  doc.setTextColor(...MUTED);
  doc.text('Chemin critique', M + 5.5, y);
  doc.setFillColor(0, 0, 0);
  drawDiamond(doc, M + 38, y - 1, 1.2);
  doc.text('Jalon', M + 41.5, y);
  doc.setFillColor(...hexToRgb(planningLotColor('Gros œuvre')));
  doc.rect(M + 54, y - 2, 4, 2, 'F');
  doc.text('Tâche standard', M + 59.5, y);
}

function drawFooter(doc, layout) {
  const { pageW, pageH } = layout;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CITYMO — Planning chantier (vue condensée 1 page)', M, pageH - FOOTER_H);
  doc.text('Échelle adaptée à la durée du projet', pageW - M, pageH - FOOTER_H, { align: 'right' });
}

/**
 * @param {object} projet
 * @param {object[]} tasks
 * @param {{ mode?: 'synthesis' | 'detailed', milestones?: object[] }} [options]
 */
export async function generateProjectPlanningPdf(projet, tasks = [], options = {}) {
  const mode = options.mode === 'synthesis' ? 'synthesis' : 'detailed';
  const milestones = options.milestones || [];
  let logo = null;
  try {
    logo = await loadCompanyLogoFit(44, 12);
  } catch {
    logo = null;
  }

  projet = { ...projet, _tasksForPdf: tasks };
  const rows = buildPdfRows(tasks, mode, milestones);
  const layout = pickPageLayout(Math.max(1, rows.length));
  const projectDates = projectSpan(tasks, projet);
  const criticalIds = computeCriticalPathIds(tasks);

  const doc = new jsPDF({ unit: 'mm', format: layout.format, orientation: 'landscape' });

  if (!tasks.length && !milestones.length) {
    drawHeader(doc, layout, {
      logo, projet, mode,
      minDate: projet.date_debut || '',
      maxDate: projet.date_fin_prevue || '',
      projectDates,
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('Aucune tâche planning enregistrée.', M, HEADER_BLOCK_H + 20);
    drawFooter(doc, layout);
    doc.save(`${fileSlug(projet, mode)}.pdf`);
    return;
  }

  const milestoneRows = milestones.map((m) => ({ date_debut: m.date_jalon, date_fin: m.date_jalon }));
  const { minDate, maxDate } = computePdfTimelineBounds(tasks, milestoneRows);
  const scale = buildPdfGanttScale(minDate, maxDate, layout.ganttW);

  drawHeader(doc, layout, { logo, projet, mode, minDate, maxDate, projectDates });
  const rowStartY = drawColumnHeaders(doc, layout, scale, minDate, maxDate);
  drawGanttGrid(doc, layout, scale, minDate, maxDate, rowStartY);

  const rowMetrics = [];
  let y = rowStartY;
  rows.forEach((row) => {
    const metric = drawRow(doc, layout, row, y, minDate, maxDate, layout.rowH, criticalIds, tasks);
    rowMetrics.push({ row, ...metric });
    y += layout.rowH;
  });

  if (mode === 'detailed') {
    drawDependencies(doc, rowMetrics);
  }

  drawLegend(doc, layout);
  drawFooter(doc, layout);
  doc.save(`${fileSlug(projet, mode)}.pdf`);
}

/** PDF synthèse : lots uniquement, 1 page. */
export async function generateProjectPlanningPdfSynthesis(projet, tasks = [], options = {}) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'synthesis', ...options });
}

/** PDF détaillé : WBS complet, 1 page condensée. */
export async function generateProjectPlanningPdfDetailed(projet, tasks = [], options = {}) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'detailed', ...options });
}
