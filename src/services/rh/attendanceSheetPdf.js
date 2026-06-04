/**
 * attendanceSheetPdf.js — Fiche de présence journalière par projet (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';

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

const COLS = [
  { key: 'num', label: 'N°', w: 10 },
  { key: 'ouvrier', label: 'Ouvrier', w: 48 },
  { key: 'entree', label: 'Entrée', w: 22 },
  { key: 'sortie', label: 'Sortie', w: 22 },
  { key: 'statut', label: 'Statut', w: 26 },
  { key: 'notes', label: 'Notes', w: CONTENT_W - 10 - 48 - 22 - 22 - 26 },
];

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

function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

function drawSignature(doc, y) {
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Signature chef de chantier', MARGIN, y);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y + 3, CONTENT_W * 0.55, 22);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('Date : _______________', MARGIN + CONTENT_W * 0.55 + 8, y + 14);
  return y + 30;
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

  const drawPageHeader = () => {
    y = drawTableHeader(doc, y);
  };

  drawPageHeader();

  records.forEach((row, i) => {
    const nextH = 12;
    if (y + nextH > TABLE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...RED);
      doc.text(`${projetNom} — ${fmtDate(date)} (suite)`, MARGIN, y);
      y += 8;
      drawPageHeader();
    }
    y = drawTableRow(doc, row, i, y);
  });

  if (y + 35 < PAGE_H) {
    drawSignature(doc, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO — Présence ouvriers', PAGE_W / 2, FOOTER_Y, { align: 'center' });

  const filename = attendanceSheetPdfFilename({ projectLabel: projetNom, date });
  downloadPdfBlob(doc.output('blob'), filename);
}
