/**
 * attendanceSheetPdf.js — Fiches de présence PDF (récap simplifié)
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { fmtWeekRange } from './attendance';

const RED = [183, 28, 28];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];
const ROW_GRAY = [245, 245, 245];
const HEADER_BG = [183, 28, 28];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 12;
const TABLE_BOTTOM = FOOTER_Y - 8;

/** Récap simplifié : ouvrier, présences, jours, heures */
const RECAP_COLS = [
  { key: 'ouvrier', label: 'Ouvrier', w: 72 },
  { key: 'pres', label: 'Présences', w: 28 },
  { key: 'jours', label: 'Jours', w: 28 },
  { key: 'heures', label: 'Heures', w: CONTENT_W - 72 - 28 - 28 },
];

const DAILY_COLS = [
  { key: 'num', label: 'N°', w: 10 },
  { key: 'ouvrier', label: 'Ouvrier', w: 55 },
  { key: 'entree', label: 'Entrée', w: 22 },
  { key: 'sortie', label: 'Sortie', w: 22 },
  { key: 'heures', label: 'Heures', w: 22 },
  { key: 'jours', label: 'Jours', w: CONTENT_W - 10 - 55 - 22 - 22 - 22 },
];

function colsWidth(cols) {
  return cols.reduce((s, c) => s + c.w, 0);
}

function dash(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    return new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function fmtHoursPdf(n) {
  const v = Number(n) || 0;
  return v > 0 ? `${v.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} h` : '—';
}

function fmtDayEquivPdf(n) {
  const v = Number(n) || 0;
  return v > 0 ? v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';
}

function slugPart(str, max = 40) {
  return (str || 'document')
    .toString()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/gi, '')
    .slice(0, max) || 'document';
}

export function attendanceSheetPdfFilename({ projectLabel, date }) {
  const projet = slugPart((projectLabel || '').split(' — ').pop() || projectLabel);
  const jour = String(date || '').slice(0, 10) || 'date';
  return `fiche-presence-${projet}-${jour}.pdf`;
}

export function attendanceWeeklyPdfFilename({ projectLabel, semaineDebut }) {
  const projet = slugPart((projectLabel || '').split(' — ').pop() || projectLabel);
  const sem = String(semaineDebut || '').slice(0, 10) || 'semaine';
  return `fiche-presence-${projet}-${sem}.pdf`;
}

function downloadPdfBlob(blob, filename, print = false) {
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (print) {
    const w = window.open(url, '_blank');
    if (w) w.onload = () => { try { w.print(); } catch { /* ignore */ } };
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  if (isIOS) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resolveProjectName(projectLabel) {
  const s = dash(projectLabel);
  if (s.includes(' — ')) return s.split(' — ').slice(1).join(' — ');
  return s;
}

function resolveChefs(records, chefChantier) {
  if (chefChantier && chefChantier !== '—') return chefChantier;
  const chefs = [...new Set(records.map((r) => r.chefChantier).filter(Boolean))];
  return chefs.length ? chefs.join(' · ') : '—';
}

function ensurePageSpace(doc, y, needed, onNewPage) {
  if (y + needed <= TABLE_BOTTOM) return y;
  doc.addPage();
  return onNewPage ? onNewPage() : MARGIN;
}

function drawGenericTableHeader(doc, cols, y) {
  const tableW = colsWidth(cols);
  const h = 9;
  let x = MARGIN;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, tableW, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  cols.forEach((col) => {
    doc.text(col.label, x + 3, y + 6);
    x += col.w;
  });
  return y + h;
}

function drawGenericTableRow(doc, cols, cells, index, y) {
  const tableW = colsWidth(cols);
  const lineSets = cols.map((col, i) => {
    const val = cells[i] == null ? '—' : String(cells[i]);
    return doc.splitTextToSize(val, col.w - 6);
  });
  const maxLines = Math.max(1, ...lineSets.map((l) => l.length));
  const rowH = Math.max(8, maxLines * 4.2 + 3);

  let x = MARGIN;
  const fill = index % 2 === 0 ? [255, 255, 255] : ROW_GRAY;
  doc.setFillColor(...fill);
  doc.rect(MARGIN, y, tableW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.12);
  doc.rect(MARGIN, y, tableW, rowH);

  cols.forEach((col, i) => {
    doc.line(x, y, x, y + rowH);
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text(lineSets[i], x + 3, y + 5.5);
    x += col.w;
  });
  doc.line(x, y, x, y + rowH);

  return y + rowH;
}

async function drawPdfHeader(doc, title) {
  const logo = await loadCompanyLogoFit(40, 14);
  let y = MARGIN;

  if (logo?.dataUrl) {
    try {
      doc.addImage(logo.dataUrl, 'PNG', MARGIN, y, logo.w, logo.h);
      y += logo.h + 6;
    } catch { /* optional */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TEXT);
  doc.text(title, PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.45);
  doc.line(MARGIN + 24, y, PAGE_W - MARGIN - 24, y);
  return y + 10;
}

function drawMetaLines(doc, lines, y) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  lines.forEach(([label, value]) => {
    doc.setTextColor(...MUTED);
    doc.text(`${label} :`, MARGIN, y);
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'bold');
    doc.text(dash(value), MARGIN + 38, y);
    doc.setFont('helvetica', 'normal');
    y += 5.5;
  });
  return y + 6;
}

function drawSignatureAndStamp(doc, y) {
  y += 8;
  const sigW = CONTENT_W * 0.48;
  const stampW = CONTENT_W * 0.48;
  const gap = CONTENT_W * 0.04;
  const boxH = 28;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Signature chef de chantier', MARGIN, y);
  doc.text('Cachet société', MARGIN + sigW + gap, y);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y + 3, sigW, boxH);
  doc.rect(MARGIN + sigW + gap, y + 3, stampW, boxH);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('Date : _______________', MARGIN, y + boxH + 11);

  return y + boxH + 18;
}

function drawPdfFooter(doc) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CITYMO — Présence ouvriers', PAGE_W / 2, FOOTER_Y, { align: 'center' });
}

/**
 * PDF journalier simplifié (une date).
 */
export async function generateAttendanceSheetPdf({
  projectLabel,
  date,
  chefChantier = '',
  records = [],
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const projetNom = resolveProjectName(projectLabel);
  const chef = resolveChefs(records, chefChantier);

  let y = await drawPdfHeader(doc, 'FEUILLE DE PRÉSENCE');
  y = drawMetaLines(doc, [
    ['Projet', projetNom],
    ['Date', fmtDate(date)],
    ['Chef de chantier', chef],
  ], y);

  y = drawGenericTableHeader(doc, DAILY_COLS, y);
  records.forEach((row, i) => {
    y = ensurePageSpace(doc, y, 12, () => drawGenericTableHeader(doc, DAILY_COLS, MARGIN));
    y = drawGenericTableRow(doc, DAILY_COLS, [
      String(i + 1).padStart(2, '0'),
      row.ouvrier || '—',
      row.heureEntree || '—',
      row.heureSortie || '—',
      fmtHoursPdf(row.heuresTravaillees),
      fmtDayEquivPdf(row.joursEquivalent),
    ], i, y);
  });

  y = ensurePageSpace(doc, y, 45, () => MARGIN);
  drawSignatureAndStamp(doc, y);
  drawPdfFooter(doc);

  downloadPdfBlob(doc.output('blob'), attendanceSheetPdfFilename({ projectLabel: projetNom, date }), false);
}

/**
 * PDF récap projet / période — simple : noms, présences, jours, heures + cachets.
 */
export async function generateAttendanceWeeklyPdf({
  projectLabel,
  semaineDebut,
  semaineFin = '',
  chefChantier = '',
  summaries = [],
  print = false,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const projetNom = resolveProjectName(projectLabel);
  const periode = fmtWeekRange(semaineDebut, semaineFin);
  const chef = chefChantier
    || [...new Set(summaries.map((s) => s.chefChantier).filter(Boolean))].join(' · ')
    || '—';

  let y = await drawPdfHeader(doc, 'RÉCAPITULATIF PRÉSENCE');

  y = drawMetaLines(doc, [
    ['Projet', projetNom],
    ['Période', periode],
    ['Chef de chantier', chef],
    ['Ouvriers', String(summaries.length)],
  ], y);

  y = drawGenericTableHeader(doc, RECAP_COLS, y);
  summaries.forEach((s, i) => {
    y = ensurePageSpace(doc, y, 12, () => drawGenericTableHeader(doc, RECAP_COLS, MARGIN));
    y = drawGenericTableRow(doc, RECAP_COLS, [
      s.ouvrier || '—',
      String(s.nbPresences ?? s.lignes?.length ?? 0),
      fmtDayEquivPdf(s.joursEquivalent ?? s.nbJoursTravailles),
      fmtHoursPdf(s.totalHeures),
    ], i, y);
  });

  y = ensurePageSpace(doc, y, 50, () => MARGIN);
  drawSignatureAndStamp(doc, y);
  drawPdfFooter(doc);

  const filename = attendanceWeeklyPdfFilename({ projectLabel: projetNom, semaineDebut });
  downloadPdfBlob(doc.output('blob'), filename, print);
}
