/**
 * projectPlanningPdf.js — Export PDF planning chantier Gantt (A3 paysage, multi-pages)
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

const PAGE_W = 420;
const PAGE_H = 297;
const M = 10;
const FOOTER_Y = PAGE_H - 7;
const LEFT_W = 98;
const GANTT_X = M + LEFT_W;
const GANTT_W = PAGE_W - M - GANTT_X;
const HEADER_BLOCK_H = 34;
const CAL_H = 12;
const ROW_H_TASK = 6;
const ROW_H_SUMMARY = 7;

const LEFT_COLS = [
  { key: 'wbs', label: 'WBS', w: 9 },
  { key: 'nom', label: 'Tâche', w: 30 },
  { key: 'duree', label: 'Dur.', w: 11 },
  { key: 'debut', label: 'Début', w: 15 },
  { key: 'fin', label: 'Fin', w: 15 },
  { key: 'resp', label: 'Resp.', w: 18 },
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

function fmtMonthYear(d) {
  if (!d) return '';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

/** Découpe la timeline en fenêtres lisibles (mois ou ~5 semaines). */
export function buildPdfTimelineWindows(minDate, maxDate, mode = 'detailed') {
  const total = daysBetweenInclusive(minDate, maxDate);

  if (mode === 'synthesis' || total <= 42) {
    return [{ minDate, maxDate, title: periodLabel(minDate, maxDate) }];
  }

  const windows = [];
  const endD = new Date(`${maxDate}T12:00:00`);

  if (total > 60) {
    let cur = new Date(`${minDate}T12:00:00`);
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur <= endD) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const mStart = new Date(y, m, 1);
      const mEnd = new Date(y, m + 1, 0);
      const minD = new Date(`${minDate}T12:00:00`);
      const winStart = mStart < minD ? minDate : mStart.toISOString().slice(0, 10);
      const winEnd = mEnd > endD ? maxDate : mEnd.toISOString().slice(0, 10);
      if (winStart <= winEnd) {
        windows.push({
          minDate: winStart,
          maxDate: winEnd,
          title: fmtMonthYear(winStart),
        });
      }
      cur = new Date(y, m + 1, 1);
    }
    return windows.length ? windows : [{ minDate, maxDate, title: periodLabel(minDate, maxDate) }];
  }

  let curStart = minDate;
  while (curStart <= maxDate) {
    const chunkEnd = addDays(curStart, 34);
    const winEnd = chunkEnd > maxDate ? maxDate : chunkEnd;
    windows.push({
      minDate: curStart,
      maxDate: winEnd,
      title: periodLabel(curStart, winEnd),
    });
    curStart = addDays(winEnd, 1);
  }
  return windows;
}

function buildWeekStarts(minDate, maxDate) {
  const weeks = [];
  const d = new Date(`${minDate}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const end = new Date(`${maxDate}T12:00:00`);
  while (d <= end) {
    const start = d.toISOString().slice(0, 10);
    const wEnd = new Date(d);
    wEnd.setDate(wEnd.getDate() + 6);
    weeks.push({
      start,
      end: wEnd > end ? maxDate : wEnd.toISOString().slice(0, 10),
      label: fmtDateShort(start),
    });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

/** Colonnes calendrier Gantt pour une fenêtre temporelle. */
export function buildPdfGanttScale(window, ganttWidth) {
  const totalDays = daysBetweenInclusive(window.minDate, window.maxDate);
  const minDayW = 2.6;
  const minWeekW = 7;

  if (totalDays <= 42 && totalDays * minDayW <= ganttWidth) {
    const cols = [];
    const d = new Date(`${window.minDate}T12:00:00`);
    const end = new Date(`${window.maxDate}T12:00:00`);
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      cols.push({
        start: iso,
        end: iso,
        label: String(d.getDate()),
        sub: d.getDate() === 1 || d.getDay() === 1 ? fmtDateShort(iso) : '',
        unit: 'day',
      });
      d.setDate(d.getDate() + 1);
    }
    return { unit: 'day', cols, colW: ganttWidth / totalDays, totalDays };
  }

  const weeks = buildWeekStarts(window.minDate, window.maxDate);
  const colW = Math.max(minWeekW, ganttWidth / Math.max(1, weeks.length));
  return {
    unit: 'week',
    cols: weeks.map((w) => ({ ...w, unit: 'week' })),
    colW,
    totalDays,
  };
}

function taskBarRect(task, timeWindow, scale, ganttX) {
  if (!task?.date_debut) return null;
  const tStart = task.date_debut;
  const tEnd = task.date_fin || task.date_debut;
  const winStart = new Date(`${timeWindow.minDate}T12:00:00`);
  const winEnd = new Date(`${timeWindow.maxDate}T12:00:00`);
  const start = new Date(`${tStart}T12:00:00`);
  const end = new Date(`${tEnd}T12:00:00`);
  if (end < winStart || start > winEnd) return null;

  const clipStart = start < winStart ? winStart : start;
  const clipEnd = end > winEnd ? winEnd : end;

  if (scale.unit === 'day') {
    const offset = Math.round((clipStart - winStart) / 86400000);
    const dur = daysBetweenInclusive(
      clipStart.toISOString().slice(0, 10),
      clipEnd.toISOString().slice(0, 10),
    );
    return {
      x: ganttX + offset * scale.colW + 0.3,
      w: Math.max(scale.colW * dur - 0.6, 1.2),
    };
  }

  let x = ganttX;
  let barStart = null;
  let barEnd = null;
  scale.cols.forEach((col) => {
    const cStart = new Date(`${col.start}T12:00:00`);
    const cEnd = new Date(`${col.end}T12:00:00`);
    const overlap = clipEnd >= cStart && clipStart <= cEnd;
    if (overlap) {
      if (barStart == null) barStart = x;
      barEnd = x + scale.colW;
    }
    x += scale.colW;
  });
  if (barStart == null) return null;
  return { x: barStart + 0.3, w: Math.max((barEnd - barStart) - 0.6, 1.5) };
}

function buildPdfRows(tasks, mode) {
  const rows = buildGanttDisplayRows(tasks, new Set());
  if (mode === 'synthesis') {
    return rows.filter((r) => r.type === 'summary');
  }
  return rows;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function fileSlug(projet, mode) {
  const ref = (projet?.ref || projet?.id || 'projet').replace(/\s+/g, '-');
  return mode === 'synthesis' ? `planning-synthese-${ref}` : `planning-detail-${ref}`;
}

function drawPageHeader(doc, { logo, projet, timeWindow, mode, pageNum, totalPages, periodTitle }) {
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
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  doc.text(projet.nom || 'Projet', tx, y0 + 5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const client = projet.client || projet.client_nom || '—';
  const avancement = globalAvancement(projet, projet._tasksForPdf || []);
  const meta = [
    `Client : ${client}`,
    `Réf. ${projet.ref || '—'}`,
    `Début ${fmtDate(projet.date_debut)} · Fin ${fmtDate(projet.date_fin_prevue)}`,
    `Avancement ${avancement}%`,
    `Édité le ${new Date().toLocaleDateString('fr-FR')}`,
  ];
  meta.forEach((line, i) => {
    doc.text(line, tx, y0 + 11 + i * 3.8);
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  const modeLabel = mode === 'synthesis' ? 'Planning synthèse' : 'Planning détaillé';
  doc.text(modeLabel, PAGE_W - M, y0 + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(periodTitle || timeWindow.title, PAGE_W - M, y0 + 10, { align: 'right' });
  doc.text(`Page ${pageNum} / ${totalPages}`, PAGE_W - M, y0 + 15, { align: 'right' });

  const lineY = y0 + HEADER_BLOCK_H - 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(M, lineY, PAGE_W - M, lineY);
  return lineY + 2;
}

function drawColumnHeaders(doc, topY, scale) {
  const tableTop = topY;
  const calTop = tableTop;
  const calMid = calTop + 5;
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
  doc.rect(GANTT_X, calTop, GANTT_W, CAL_H, 'F');
  doc.rect(GANTT_X, calTop, GANTT_W, CAL_H);

  let gx = GANTT_X;
  if (scale.unit === 'day') {
    let lastMonth = '';
    scale.cols.forEach((col) => {
      const month = fmtMonthYear(col.start);
      if (month !== lastMonth) {
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text(month, gx + 1, calMid);
        lastMonth = month;
      }
      doc.setFontSize(5.5);
      doc.text(col.label, gx + scale.colW / 2, calBot - 2, { align: 'center' });
      doc.setDrawColor(...GRID);
      doc.line(gx, calTop, gx, calBot + 200);
      gx += scale.colW;
    });
  } else {
    let lastMonth = '';
    scale.cols.forEach((col) => {
      const month = fmtMonthYear(col.start);
      if (month !== lastMonth) {
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text(month, gx + 1, calMid);
        lastMonth = month;
      }
      doc.setFontSize(5.5);
      doc.text(col.label, gx + scale.colW / 2, calBot - 2, { align: 'center' });
      doc.setDrawColor(...GRID);
      doc.line(gx, calTop, gx, calBot + 200);
      gx += scale.colW;
    });
  }

  doc.setDrawColor(...BORDER);
  doc.line(GANTT_X, calBot, PAGE_W - M, calBot);
  return calBot + 1;
}

function drawGanttGrid(doc, startY, endY, scale) {
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.15);
  let gx = GANTT_X;
  scale.cols.forEach(() => {
    doc.line(gx, startY, gx, endY);
    gx += scale.colW;
  });
  doc.setDrawColor(...BORDER);
  doc.line(GANTT_X, startY, GANTT_X, endY);
  doc.line(PAGE_W - M, startY, PAGE_W - M, endY);
}

function drawRow(doc, row, y, timeWindow, scale) {
  const isSummary = row.type === 'summary';
  const rowH = isSummary ? ROW_H_SUMMARY : ROW_H_TASK;

  doc.setFillColor(isSummary ? 245 : 255, isSummary ? 245 : 255, isSummary ? 245 : 255);
  doc.rect(M, y, LEFT_W + GANTT_W, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  doc.line(M, y + rowH, PAGE_W - M, y + rowH);

  let x = M + 1;
  const nom = row.nom || '—';
  const nomLines = doc.splitTextToSize(nom, LEFT_COLS[1].w - 2);
  const fontSize = isSummary ? 7 : 6.5;

  doc.setFont('helvetica', isSummary ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...BLACK);

  doc.text(String(row.wbs || ''), x, y + 4);
  x += LEFT_COLS[0].w;
  doc.text(nomLines.slice(0, 2), x, y + 4);
  x += LEFT_COLS[1].w;
  doc.text(row.duree_jours ? `${row.duree_jours}j` : '—', x, y + 4);
  x += LEFT_COLS[2].w;
  doc.text(fmtDate(row.date_debut), x, y + 4);
  x += LEFT_COLS[3].w;
  doc.text(fmtDate(row.date_fin), x, y + 4);
  x += LEFT_COLS[4].w;
  const resp = doc.splitTextToSize(row.responsable || '—', LEFT_COLS[5].w - 2);
  doc.text(resp.slice(0, 1), x, y + 4);

  const bar = taskBarRect(row, timeWindow, scale, GANTT_X);
  if (bar) {
    const lot = row.lot || row.nom;
    const rgb = hexToRgb(planningLotColor(lot));
    const barY = y + 2;
    const barH = rowH - 3;
    doc.setFillColor(...rgb);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(bar.x, barY, bar.w, barH, 0.8, 0.8, 'F');
    } else {
      doc.rect(bar.x, barY, bar.w, barH, 'F');
    }
    const pct = Math.min(100, Math.max(0, Number(row.avancement) || 0));
    if (pct > 0 && pct < 100) {
      doc.setFillColor(46, 125, 50);
      doc.rect(bar.x, barY + barH - 1.2, (bar.w * pct) / 100, 1.2, 'F');
    }
    if (bar.w > 8) {
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${Math.round(pct)}%`, bar.x + 1.5, barY + barH - 1.8);
    }
  }

  return rowH;
}

function drawFooter(doc, pageNum, totalPages) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CITYMO — Planning chantier', M, FOOTER_Y);
  doc.text(`Page ${pageNum} / ${totalPages}`, PAGE_W - M, FOOTER_Y, { align: 'right' });
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
    logo = await loadCompanyLogoFit(44, 14);
  } catch {
    logo = null;
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });

  projet = { ...projet, _tasksForPdf: tasks };

  if (!tasks.length) {
    drawPageHeader(doc, {
      logo, projet, timeWindow: { title: '—' }, mode, pageNum: 1, totalPages: 1, periodTitle: 'Aucune tâche',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('Aucune tâche planning enregistrée.', M, HEADER_BLOCK_H + 20);
    drawFooter(doc, 1, 1);
    doc.save(`${fileSlug(projet, mode)}.pdf`);
    return;
  }

  const { minDate, maxDate } = computeTimelineBounds(tasks, projet);
  const windows = buildPdfTimelineWindows(minDate, maxDate, mode);
  const rows = buildPdfRows(tasks, mode);

  const bodyTop = M + HEADER_BLOCK_H + CAL_H + 2;
  const bodyBottom = FOOTER_Y - 4;
  const maxRowsPerPage = Math.max(1, Math.floor((bodyBottom - bodyTop) / ROW_H_TASK));

  const pages = [];
  windows.forEach((timeWindow) => {
    const rowChunks = chunkArray(rows, maxRowsPerPage);
    rowChunks.forEach((chunk) => {
      pages.push({ timeWindow, rows: chunk });
    });
  });

  const totalPages = Math.max(1, pages.length);

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage({ format: 'a3', orientation: 'landscape' });
    }
    const scale = buildPdfGanttScale(page.timeWindow, GANTT_W);
    const headerEnd = drawPageHeader(doc, {
      logo,
      projet,
      timeWindow: page.timeWindow,
      mode,
      pageNum: pageIndex + 1,
      totalPages,
      periodTitle: page.timeWindow.title,
    });
    const rowStartY = drawColumnHeaders(doc, headerEnd, scale);
    drawGanttGrid(doc, rowStartY, bodyBottom, scale);

    let y = rowStartY;
    page.rows.forEach((row) => {
      y += drawRow(doc, row, y, page.timeWindow, scale);
    });

    drawFooter(doc, pageIndex + 1, totalPages);
  });

  doc.save(`${fileSlug(projet, mode)}.pdf`);
}

/** PDF synthèse : lots uniquement, vue globale. */
export async function generateProjectPlanningPdfSynthesis(projet, tasks = []) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'synthesis' });
}

/** PDF détaillé : WBS complet, multi-pages. */
export async function generateProjectPlanningPdfDetailed(projet, tasks = []) {
  return generateProjectPlanningPdf(projet, tasks, { mode: 'detailed' });
}
