/**
 * projectPlanningPdf.js — Export PDF planning Gantt (1 page, timeline condensée)
 */
import { jsPDF } from 'jspdf';
import { planningLotColor } from '../../constants/projectPlanning';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import {
  buildGanttDisplayRows,
  computeTimelineBounds,
  daysBetweenInclusive,
} from './projectPlanningTasks';

const RED = [198, 40, 40];
const BLACK = [33, 33, 33];
const MUTED = [110, 110, 110];
const BORDER = [200, 200, 200];
const HEADER_BG = [248, 248, 248];
const GRID = [230, 230, 230];
const DEP_COLOR = [90, 90, 90];

const M = 10;
const LEFT_W = 92;
const HEADER_BLOCK_H = 30;
const CAL_H = 14;
const FOOTER_H = 7;
const MIN_ROW_H = 4;
const MAX_ROW_H = 7;

const FORMATS = {
  a3: { w: 420, h: 297, name: 'a3' },
  a2: { w: 594, h: 420, name: 'a2' },
};

const LEFT_COLS = [
  { key: 'wbs', label: 'WBS', w: 9 },
  { key: 'nom', label: 'Tâche', w: 34 },
  { key: 'duree', label: 'Dur.', w: 11 },
  { key: 'debut', label: 'Début', w: 18 },
  { key: 'fin', label: 'Fin', w: 18 },
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

function periodLabel(minDate, maxDate) {
  return `${fmtDate(minDate)} → ${fmtDate(maxDate)}`;
}

/** Échelle temporelle : jours / semaines / mois selon la durée totale. */
export function buildPdfGanttScale(minDate, maxDate, ganttWidth) {
  const totalDays = daysBetweenInclusive(minDate, maxDate);

  if (totalDays <= 45) {
    const cols = [];
    const d = new Date(`${minDate}T12:00:00`);
    const end = new Date(`${maxDate}T12:00:00`);
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      cols.push({ start: iso, end: iso, label: String(d.getDate()), unit: 'day' });
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
      const start = d.toISOString().slice(0, 10);
      const wEnd = new Date(d);
      wEnd.setDate(wEnd.getDate() + 6);
      cols.push({
        start,
        end: wEnd > end ? maxDate : wEnd.toISOString().slice(0, 10),
        label: fmtDateShort(start),
        unit: 'week',
      });
      d.setDate(d.getDate() + 7);
    }
    return { unit: 'week', cols, totalDays, ganttWidth };
  }

  const cols = [];
  const d = new Date(`${minDate}T12:00:00`);
  d.setDate(1);
  const end = new Date(`${maxDate}T12:00:00`);
  while (d <= end) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const mStart = new Date(y, m, 1);
    const mEnd = new Date(y, m + 1, 0);
    const start = mStart < new Date(`${minDate}T12:00:00`) ? minDate : mStart.toISOString().slice(0, 10);
    const mend = mEnd > end ? maxDate : mEnd.toISOString().slice(0, 10);
    cols.push({ start, end: mend, label: fmtMonthShort(start), unit: 'month' });
    d.setMonth(m + 1);
  }
  return { unit: 'month', cols, totalDays, ganttWidth };
}

/** Position proportionnelle d'une barre sur la timeline globale. */
export function taskBarProportional(task, minDate, maxDate, ganttX, ganttW) {
  if (!task?.date_debut) return null;
  const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
  const winStart = new Date(`${minDate}T12:00:00`);
  const tStart = new Date(`${task.date_debut}T12:00:00`);
  const tEnd = new Date(`${(task.date_fin || task.date_debut)}T12:00:00`);
  if (tEnd < winStart) return null;

  const offsetDays = Math.max(0, Math.round((tStart - winStart) / 86400000));
  const durDays = daysBetweenInclusive(
    task.date_debut,
    task.date_fin || task.date_debut,
  );

  const x = ganttX + (offsetDays / totalDays) * ganttW;
  const w = Math.max((durDays / totalDays) * ganttW, 1.2);
  return { x: x + 0.2, w: w - 0.4, endX: x + w };
}

function buildPdfRows(tasks, mode) {
  const rows = buildGanttDisplayRows(tasks, new Set());
  if (mode === 'synthesis') return rows.filter((r) => r.type === 'summary');
  return rows;
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

function drawHeader(doc, layout, { logo, projet, mode, minDate, maxDate }) {
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

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const client = projet.client || projet.client_nom || '—';
  const avancement = globalAvancement(projet, projet._tasksForPdf || []);
  [
    `Client : ${client}`,
    `Réf. ${projet.ref || '—'}`,
    `Planning : ${periodLabel(minDate, maxDate)}`,
    `Avancement ${avancement}% · Édité le ${new Date().toLocaleDateString('fr-FR')}`,
  ].forEach((line, i) => {
    doc.text(line, tx, y0 + 10 + i * 3.5);
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
  doc.setFontSize(6);
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
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(col.label, cx, calBot - 2, { align: 'center' });
    const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
    const winStart = new Date(`${minDate}T12:00:00`);
    const cStart = new Date(`${col.start}T12:00:00`);
    const offset = Math.max(0, Math.round((cStart - winStart) / 86400000));
    const gx = ganttX + (offset / totalDays) * ganttW;
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

  const totalDays = Math.max(1, daysBetweenInclusive(minDate, maxDate));
  const winStart = new Date(`${minDate}T12:00:00`);
  scale.cols.forEach((col) => {
    const cStart = new Date(`${col.start}T12:00:00`);
    const offset = Math.max(0, Math.round((cStart - winStart) / 86400000));
    const gx = ganttX + (offset / totalDays) * ganttW;
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.1);
    doc.line(gx, startY, gx, bodyBottom);
  });
}

function drawRow(doc, layout, row, y, minDate, maxDate, rowH) {
  const { ganttX, ganttW, pageW } = layout;
  const isSummary = row.type === 'summary';

  doc.setFillColor(isSummary ? 245 : 255, isSummary ? 245 : 255, isSummary ? 245 : 255);
  doc.rect(M, y, LEFT_W + ganttW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.12);
  doc.line(M, y + rowH, pageW - M, y + rowH);

  let x = M + 1;
  const nom = row.nom || '—';
  const nomLines = doc.splitTextToSize(nom, LEFT_COLS[1].w - 2);
  const fontSize = isSummary ? Math.min(7, rowH - 1) : Math.min(6.5, rowH - 1);

  doc.setFont('helvetica', isSummary ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...BLACK);

  doc.text(String(row.wbs || ''), x, y + rowH - 1.8);
  x += LEFT_COLS[0].w;
  doc.text(nomLines.slice(0, 1), x, y + rowH - 1.8);
  x += LEFT_COLS[1].w;
  doc.text(row.duree_jours ? `${row.duree_jours}j` : '—', x, y + rowH - 1.8);
  x += LEFT_COLS[2].w;
  doc.text(fmtDate(row.date_debut), x, y + rowH - 1.8);
  x += LEFT_COLS[3].w;
  doc.text(fmtDate(row.date_fin), x, y + rowH - 1.8);

  const bar = taskBarProportional(row, minDate, maxDate, ganttX, ganttW);
  if (bar) {
    const lot = row.lot || row.nom;
    const rgb = hexToRgb(planningLotColor(lot));
    const barY = y + 1.2;
    const barH = Math.max(1.5, rowH - 2.2);
    doc.setFillColor(...rgb);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(bar.x, barY, bar.w, barH, 0.6, 0.6, 'F');
    } else {
      doc.rect(bar.x, barY, bar.w, barH, 'F');
    }
    const pct = Math.min(100, Math.max(0, Number(row.avancement) || 0));
    if (pct > 0 && pct < 100) {
      doc.setFillColor(46, 125, 50);
      doc.rect(bar.x, barY + barH - 1, (bar.w * pct) / 100, 1, 'F');
    }
    if (bar.w > 10 && rowH >= 5) {
      doc.setFontSize(4.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${Math.round(pct)}%`, bar.x + 1, barY + barH - 1.2);
    }
    return { bar, barY, barH, rowCenterY: y + rowH / 2 };
  }
  return { bar: null, rowCenterY: y + rowH / 2 };
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
 * @param {{ mode?: 'synthesis' | 'detailed' }} [options]
 */
export async function generateProjectPlanningPdf(projet, tasks = [], options = {}) {
  const mode = options.mode === 'synthesis' ? 'synthesis' : 'detailed';
  let logo = null;
  try {
    logo = await loadCompanyLogoFit(44, 12);
  } catch {
    logo = null;
  }

  projet = { ...projet, _tasksForPdf: tasks };
  const rows = buildPdfRows(tasks, mode);
  const layout = pickPageLayout(Math.max(1, rows.length));

  const doc = new jsPDF({ unit: 'mm', format: layout.format, orientation: 'landscape' });

  if (!tasks.length) {
    drawHeader(doc, layout, {
      logo, projet, mode, minDate: projet.date_debut || '', maxDate: projet.date_fin_prevue || '',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('Aucune tâche planning enregistrée.', M, HEADER_BLOCK_H + 20);
    drawFooter(doc, layout);
    doc.save(`${fileSlug(projet, mode)}.pdf`);
    return;
  }

  const { minDate, maxDate } = computeTimelineBounds(tasks, projet);
  const scale = buildPdfGanttScale(minDate, maxDate, layout.ganttW);

  const headerEnd = drawHeader(doc, layout, { logo, projet, mode, minDate, maxDate });
  const rowStartY = drawColumnHeaders(doc, layout, scale, minDate, maxDate);
  drawGanttGrid(doc, layout, scale, minDate, maxDate, rowStartY);

  const rowMetrics = [];
  let y = rowStartY;
  rows.forEach((row) => {
    const metric = drawRow(doc, layout, row, y, minDate, maxDate, layout.rowH);
    rowMetrics.push({ row, ...metric });
    y += layout.rowH;
  });

  if (mode === 'detailed') {
    drawDependencies(doc, rowMetrics);
  }

  drawFooter(doc, layout);
  doc.save(`${fileSlug(projet, mode)}.pdf`);
}

/** PDF synthèse : lots uniquement, 1 page. */
export async function generateProjectPlanningPdfSynthesis(projet, tasks = []) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'synthesis' });
}

/** PDF détaillé : WBS complet, 1 page condensée. */
export async function generateProjectPlanningPdfDetailed(projet, tasks = []) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'detailed' });
}
