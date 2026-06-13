/**
 * attendanceSheetPdf.js — Fiches de présence PDF (journalière + hebdomadaire récap)
 */
import { jsPDF } from 'jspdf';
import { fmtWeekRange } from './attendance';

const LOGO_URL = 'https://i.ibb.co/Ldm3WWdK/Capture-d-e-cran-2026-05-26-a-12-16-21.png';

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

const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

const COLS = [
  { key: 'num', label: 'N°', w: 10 },
  { key: 'ouvrier', label: 'Ouvrier', w: 48 },
  { key: 'entree', label: 'Entrée', w: 22 },
  { key: 'sortie', label: 'Sortie', w: 22 },
  { key: 'statut', label: 'Statut', w: 26 },
  { key: 'notes', label: 'Notes', w: CONTENT_W - 10 - 48 - 22 - 22 - 26 },
];

const SUMMARY_COLS = [
  { key: 'ouvrier', label: 'Ouvrier', w: 40 },
  { key: 'pres', label: 'Présences', w: 18 },
  { key: 'jours', label: 'Jours trav.', w: 18 },
  { key: 'heures', label: 'H. travaillées', w: 22 },
  { key: 'retard', label: 'Retard', w: 18 },
  { key: 'equiv', label: 'Équiv. j', w: 18 },
  { key: 'statut', label: 'Statut', w: CONTENT_W - 40 - 18 - 18 - 22 - 18 - 18 },
];

/** Colonnes = champs formulaire présence + calculs automatiques */
const FORM_DETAIL_COLS = [
  { key: 'date', label: 'Date', w: 18 },
  { key: 'jour', label: 'Jour', w: 11 },
  { key: 'chef', label: 'Chef chantier', w: 26 },
  { key: 'entree', label: 'Entrée', w: 15 },
  { key: 'sortie', label: 'Sortie', w: 15 },
  { key: 'heures', label: 'H. travaillées', w: 17 },
  { key: 'retard', label: 'Retard', w: 14 },
  { key: 'equiv', label: 'Équiv. j', w: 13 },
  { key: 'statut', label: 'Statut', w: 20 },
  { key: 'notes', label: 'Notes', w: CONTENT_W - 18 - 11 - 26 - 15 - 15 - 17 - 14 - 13 - 20 },
];

const FULL_DETAIL_COLS = [
  { key: 'ouvrier', label: 'Ouvrier', w: 32 },
  { key: 'date', label: 'Date', w: 16 },
  { key: 'jour', label: 'Jour', w: 10 },
  { key: 'chef', label: 'Chef chantier', w: 24 },
  { key: 'entree', label: 'Entrée', w: 13 },
  { key: 'sortie', label: 'Sortie', w: 13 },
  { key: 'heures', label: 'H. trav.', w: 14 },
  { key: 'retard', label: 'Retard', w: 12 },
  { key: 'equiv', label: 'Équiv.', w: 12 },
  { key: 'statut', label: 'Statut', w: 16 },
  { key: 'notes', label: 'Notes', w: CONTENT_W - 32 - 16 - 10 - 24 - 13 - 13 - 14 - 12 - 12 - 16 },
];

function colsWidth(cols) {
  return cols.reduce((s, c) => s + c.w, 0);
}

function attendanceRowToDetailCells(row, projetNom) {
  return [
    fmtDate(row.date),
    fmtJourPdf(row.date),
    row.chefChantier || '—',
    row.heureEntree || '—',
    row.heureSortie || '—',
    fmtHoursPdf(row.heuresTravaillees),
    fmtHoursPdf(row.retardHeures),
    fmtDayEquivPdf(row.joursEquivalent),
    row.statut || '—',
    row.notes || '—',
  ];
}

function attendanceRowToFullCells(row, ouvrier, projetNom) {
  return [
    ouvrier || row.ouvrier || '—',
    fmtDate(row.date),
    fmtJourPdf(row.date),
    row.chefChantier || '—',
    row.heureEntree || '—',
    row.heureSortie || '—',
    fmtHoursPdf(row.heuresTravaillees),
    fmtHoursPdf(row.retardHeures),
    fmtDayEquivPdf(row.joursEquivalent),
    row.statut || '—',
    row.notes || '—',
  ];
}

function dash(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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
  return v > 0 ? v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : '—';
}

function fmtJourPdf(iso) {
  if (!iso) return '—';
  try {
    return JOURS[new Date(`${String(iso).slice(0, 10)}T12:00:00`).getDay()];
  } catch {
    return '—';
  }
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

async function loadLogoDataUrl() {
  try {
    const res = await fetch(LOGO_URL, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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

function downloadPdfBlobLegacy(blob, filename) {
  downloadPdfBlob(blob, filename, false);
}

function drawMetaTable(doc, rows, y) {
  const col1W = CONTENT_W * 0.32;
  const col2W = CONTENT_W - col1W;

  rows.forEach(([label, value]) => {
    const val = dash(value);
    const valueLines = doc.splitTextToSize(val, col2W - 6);
    const rowH = Math.max(7, valueLines.length * 4 + 3);

    doc.setFillColor(...ROW_GRAY);
    doc.rect(MARGIN, y, col1W, rowH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN + col1W, y, col2W, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_W, rowH);
    doc.line(MARGIN + col1W, y, MARGIN + col1W, y + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, MARGIN + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(valueLines, MARGIN + col1W + 3, y + 5);

    y += rowH;
  });

  return y + 6;
}

function drawTableHeader(doc, y) {
  const h = 8;
  let x = MARGIN;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_W, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  COLS.forEach((col) => {
    doc.text(col.label, x + 2, y + 5.5);
    x += col.w;
  });
  return y + h;
}

function drawTableRow(doc, row, index, y) {
  const lines = {
    num: [String(index + 1).padStart(3, '0')],
    ouvrier: doc.splitTextToSize(dash(row.ouvrier), COLS[1].w - 4),
    entree: [dash(row.heureEntree)],
    sortie: [dash(row.heureSortie)],
    statut: [dash(row.statut)],
    notes: doc.splitTextToSize(dash(row.notes), COLS[5].w - 4),
  };
  const maxLines = Math.max(
    lines.num.length,
    lines.ouvrier.length,
    lines.entree.length,
    lines.sortie.length,
    lines.statut.length,
    lines.notes.length,
  );
  const rowH = Math.max(7, maxLines * 4 + 3);

  let x = MARGIN;
  const fill = index % 2 === 0 ? [255, 255, 255] : ROW_GRAY;
  doc.setFillColor(...fill);
  doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.12);
  doc.rect(MARGIN, y, CONTENT_W, rowH);

  const keys = ['num', 'ouvrier', 'entree', 'sortie', 'statut', 'notes'];
  keys.forEach((key, i) => {
    doc.line(x, y, x, y + rowH);
    doc.setFont('helvetica', key === 'ouvrier' ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(lines[key], x + 2, y + 5);
    x += COLS[i].w;
  });
  doc.line(x, y, x, y + rowH);

  return y + rowH;
}

function drawSignatureAndStamp(doc, y) {
  y += 4;
  const sigW = CONTENT_W * 0.48;
  const stampW = CONTENT_W * 0.48;
  const boxH = 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Signature chef de chantier', MARGIN, y);
  doc.text('Cachet société', MARGIN + sigW + CONTENT_W * 0.04, y);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y + 3, sigW, boxH);
  doc.rect(MARGIN + sigW + CONTENT_W * 0.04, y + 3, stampW, boxH);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('Date : _______________', MARGIN, y + boxH + 10);

  return y + boxH + 16;
}

function drawSignature(doc, y) {
  return drawSignatureAndStamp(doc, y);
}

function resolveChefs(records, chefChantier) {
  if (chefChantier && chefChantier !== '—') return chefChantier;
  const chefs = [...new Set(records.map((r) => r.chefChantier).filter(Boolean))];
  return chefs.length ? chefs.join(' · ') : '—';
}

function resolveProjectName(projectLabel) {
  const s = dash(projectLabel);
  if (s.includes(' — ')) return s.split(' — ').slice(1).join(' — ');
  return s;
}

/**
 * @param {object} opts
 * @param {string} opts.projectLabel
 * @param {string} opts.date — YYYY-MM-DD
 * @param {string} [opts.chefChantier]
 * @param {object[]} opts.records — lignes présence normalisées
 * @param {{ present?: number, absent?: number, total?: number }} [opts.stats]
 */
export async function generateAttendanceSheetPdf({
  projectLabel,
  date,
  chefChantier = '',
  records = [],
  stats = {},
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logoData = await loadLogoDataUrl();
  let y = MARGIN;

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', MARGIN, y, 42, 14);
      y += 18;
    } catch { /* optional */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...TEXT);
  doc.text('FEUILLE DE PRÉSENCE', PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 20, y, PAGE_W - MARGIN - 20, y);
  y += 10;

  const projetNom = resolveProjectName(projectLabel);
  const chef = resolveChefs(records, chefChantier);

  y = drawMetaTable(doc, [
    ['Projet', projetNom],
    ['Réf. / libellé', projectLabel],
    ['Date', fmtDate(date)],
    ['Chef(s) de chantier', chef],
    ['Présents', String(stats.present ?? 0)],
    ['Absents', String(stats.absent ?? 0)],
    ['Total lignes', String(stats.total ?? records.length)],
  ], y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text('Saisies formulaire — détail complet', MARGIN, y);
  y += 8;

  y = drawGenericTableHeader(doc, FULL_DETAIL_COLS, y);
  records.forEach((row, i) => {
    y = ensurePageSpace(doc, y, 10, () => drawGenericTableHeader(doc, FULL_DETAIL_COLS, MARGIN));
    y = drawGenericTableRow(doc, FULL_DETAIL_COLS, attendanceRowToFullCells(row, row.ouvrier, projetNom), i, y);
  });

  if (y + 35 < PAGE_H) {
    drawSignature(doc, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO — Présence ouvriers', PAGE_W / 2, FOOTER_Y, { align: 'center' });

  const filename = attendanceSheetPdfFilename({ projectLabel: projetNom, date });
  downloadPdfBlobLegacy(doc.output('blob'), filename);
}

function ensurePageSpace(doc, y, needed, onNewPage) {
  if (y + needed <= TABLE_BOTTOM) return y;
  doc.addPage();
  return onNewPage ? onNewPage() : MARGIN;
}

function drawGenericTableHeader(doc, cols, y) {
  const tableW = colsWidth(cols);
  const h = 8;
  let x = MARGIN;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, tableW, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  cols.forEach((col) => {
    doc.text(col.label, x + 2, y + 5.5);
    x += col.w;
  });
  return y + h;
}

function drawGenericTableRow(doc, cols, cells, index, y) {
  const tableW = colsWidth(cols);
  const lineSets = cols.map((col, i) => {
    const val = cells[i] == null ? '—' : String(cells[i]);
    return doc.splitTextToSize(val, col.w - 4);
  });
  const maxLines = Math.max(1, ...lineSets.map((l) => l.length));
  const rowH = Math.max(7, maxLines * 3.8 + 3);

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
    doc.setFontSize(7);
    doc.setTextColor(...TEXT);
    doc.text(lineSets[i], x + 2, y + 5);
    x += col.w;
  });
  doc.line(x, y, x, y + rowH);

  return y + rowH;
}

function drawPdfLogoTitle(doc, logoData, title, yStart = MARGIN) {
  let y = yStart;
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', MARGIN, y, 42, 14);
      y += 18;
    } catch { /* optional */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...TEXT);
  doc.text(title, PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 20, y, PAGE_W - MARGIN - 20, y);
  return y + 10;
}

function drawPdfFooter(doc) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO — Présence ouvriers', PAGE_W / 2, FOOTER_Y, { align: 'center' });
}

/**
 * PDF hebdomadaire : récapitulatif par ouvrier + détail journalier.
 * @param {object} opts
 * @param {string} opts.projectLabel
 * @param {string} opts.semaineDebut
 * @param {string} [opts.semaineFin]
 * @param {string} [opts.chefChantier]
 * @param {object[]} opts.summaries — résumés ouvrier (groupAttendanceByProjectWeekWorker)
 * @param {boolean} [opts.print]
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
  const logoData = await loadLogoDataUrl();
  const projetNom = resolveProjectName(projectLabel);
  const periode = fmtWeekRange(semaineDebut, semaineFin);
  const chef = chefChantier
    || [...new Set(summaries.map((s) => s.chefChantier).filter(Boolean))].join(' · ')
    || '—';

  let y = drawPdfLogoTitle(doc, logoData, 'FEUILLE DE PRÉSENCE — RÉCAPITULATIF');

  y = drawMetaTable(doc, [
    ['Projet / Chantier', projetNom],
    ['Période', periode],
    ['Chef de chantier', chef],
    ['Nombre d\'ouvriers', String(summaries.length)],
  ], y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text('Récapitulatif par ouvrier', MARGIN, y);
  y += 8;

  y = drawGenericTableHeader(doc, SUMMARY_COLS, y);
  summaries.forEach((s, i) => {
    y = ensurePageSpace(doc, y, 10, () => drawGenericTableHeader(doc, SUMMARY_COLS, MARGIN));
    y = drawGenericTableRow(doc, SUMMARY_COLS, [
      s.ouvrier || '—',
      String(s.nbPresences ?? s.lignes?.length ?? 0),
      String(s.nbJoursTravailles ?? 0),
      fmtHoursPdf(s.totalHeures),
      fmtHoursPdf(s.totalRetard),
      fmtDayEquivPdf(s.joursEquivalent),
      s.statutGlobal || '—',
    ], i, y);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  y = ensurePageSpace(doc, y, 14, () => MARGIN);
  y += 4;
  doc.text('Colonnes détail : Date, Jour, Chef de chantier, Entrée, Sortie, H. travaillées, Retard, Équiv. jour, Statut, Notes (saisie formulaire).', MARGIN, y);
  y += 10;

  summaries.forEach((s) => {
    y = ensurePageSpace(doc, y, 40, () => MARGIN);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...RED);
    doc.text(`Saisies — ${s.ouvrier || 'Ouvrier'}`, MARGIN, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Projet : ${projetNom} · Période : ${periode}`, MARGIN, y + 4);
    y += 10;

    y = drawGenericTableHeader(doc, FORM_DETAIL_COLS, y);
    (s.lignes || []).forEach((row, i) => {
      y = ensurePageSpace(doc, y, 10, () => drawGenericTableHeader(doc, FORM_DETAIL_COLS, MARGIN));
      y = drawGenericTableRow(doc, FORM_DETAIL_COLS, attendanceRowToDetailCells(row, projetNom), i, y);
    });

    y = ensurePageSpace(doc, y, 40, () => MARGIN);
    y = drawSignatureAndStamp(doc, y);
  });

  y = ensurePageSpace(doc, y, 30, () => MARGIN);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text('Tableau complet — toutes les saisies', MARGIN, y);
  y += 8;

  y = drawGenericTableHeader(doc, FULL_DETAIL_COLS, y);
  let fullIdx = 0;
  summaries.forEach((s) => {
    (s.lignes || []).forEach((row) => {
      y = ensurePageSpace(doc, y, 10, () => drawGenericTableHeader(doc, FULL_DETAIL_COLS, MARGIN));
      y = drawGenericTableRow(doc, FULL_DETAIL_COLS, attendanceRowToFullCells(row, s.ouvrier, projetNom), fullIdx, y);
      fullIdx += 1;
    });
  });

  drawPdfFooter(doc);

  const filename = attendanceWeeklyPdfFilename({ projectLabel: projetNom, semaineDebut });
  downloadPdfBlob(doc.output('blob'), filename, print);
}
