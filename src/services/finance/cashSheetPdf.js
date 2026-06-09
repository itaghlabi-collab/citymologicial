/**
 * cashSheetPdf.js — Export PDF feuille de caisse mensuelle (rendu administratif CITYMO)
 */
import { jsPDF } from 'jspdf';
import {
  FINANCE_COMPANY,
  formatPdfMAD,
  loadCompanyLogo,
  TEXT,
  MUTED,
  RED,
  BORDER,
} from './pdfShared';

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TABLE_TOP_FIRST = 78;
const TABLE_TOP_NEXT = 28;
const TABLE_BOTTOM = 248;
const FOOTER_Y = 262;

const HEADER_BG = [58, 58, 58];
const ROW_ALT = [248, 248, 248];
const GREEN_DARK = [22, 115, 62];
const RED_DARK = [166, 32, 32];
const SUMMARY_BG = [252, 252, 252];

const COLS = [
  { label: 'Date', w: 22 },
  { label: 'Contrepartie', w: 34 },
  { label: 'Description', w: 56 },
  { label: 'Sortie', w: 24, align: 'right' },
  { label: 'Entrée', w: 24, align: 'right' },
  { label: 'Paiement', w: 20 },
];

const ROW_H = 7;
const HEADER_H = 8;

function colX(index) {
  let x = MARGIN;
  for (let i = 0; i < index; i += 1) x += COLS[i].w;
  return x;
}

function formatGeneratedAt() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function drawCompanyHeader(doc, logo, logoSize) {
  if (logo && logoSize) {
    doc.addImage(logo, 'PNG', MARGIN, 12, logoSize.w, logoSize.h);
  }

  const infoX = logo ? MARGIN + logoSize.w + 6 : MARGIN;
  let infoY = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(FINANCE_COMPANY.name, infoX, infoY);
  infoY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT);
  doc.text(FINANCE_COMPANY.address, infoX, infoY);
  infoY += 4;
  doc.text(`${FINANCE_COMPANY.phone}  •  ${FINANCE_COMPANY.email}`, infoX, infoY);
  infoY += 4;

  const legal = [FINANCE_COMPANY.rc, FINANCE_COMPANY.ice].filter(Boolean).join('  •  ');
  if (legal) {
    doc.setTextColor(...MUTED);
    doc.text(legal, infoX, infoY);
  }

  return Math.max(logo ? 12 + logoSize.h : 14, infoY + 2);
}

function drawTitle(doc, title) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text(title, PAGE_W / 2, 40, { align: 'center' });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 43, PAGE_W - MARGIN, 43);
}

function drawSummaryBox(doc, totals) {
  const boxW = 88;
  const boxH = 30;
  const boxX = PAGE_W - MARGIN - boxW;
  const boxY = 48;

  doc.setFillColor(...SUMMARY_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  const rows = [
    ['Solde initial', formatPdfMAD(totals.soldeInitial)],
    ['Total entrées', formatPdfMAD(totals.totalEntrees)],
    ['Total sorties', formatPdfMAD(totals.totalSorties)],
    ['Solde caisse du mois', formatPdfMAD(totals.soldeMois)],
  ];

  let y = boxY + 6;
  rows.forEach(([label, value], idx) => {
    const isLast = idx === rows.length - 1;
    doc.setFont('helvetica', isLast ? 'bold' : 'normal');
    doc.setFontSize(isLast ? 8.5 : 8);
    doc.setTextColor(...(isLast ? TEXT : MUTED));
    doc.text(label, boxX + 4, y);
    doc.setTextColor(...(isLast ? RED : TEXT));
    doc.text(value, boxX + boxW - 4, y, { align: 'right' });
    y += isLast ? 7 : 5.5;
  });
}

function drawTableHeader(doc, y) {
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_W, HEADER_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);

  COLS.forEach((col, i) => {
    const x = colX(i);
    const tx = col.align === 'right' ? x + col.w - 2 : x + 2;
    doc.text(col.label, tx, y + 5.5, col.align === 'right' ? { align: 'right' } : undefined);
  });

  return y + HEADER_H;
}

function measureRowHeight(doc, transaction) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const descW = COLS[2].w - 4;
  const lines = doc.splitTextToSize(transaction.description || '—', descW);
  return Math.max(ROW_H, lines.length * 3.6 + 2.5);
}

function drawTableRow(doc, y, transaction, rowIndex) {
  const rowH = measureRowHeight(doc, transaction);
  const isAlt = rowIndex % 2 === 1;

  if (isAlt) {
    doc.setFillColor(...ROW_ALT);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
  }

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.15);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT);

  const dateStr = transaction.date
    ? String(transaction.date).split('-').reverse().join('/')
    : '—';

  doc.text(dateStr, colX(0) + 2, y + 5);

  const cp = (transaction.contrepartie || '—').trim();
  doc.text(doc.splitTextToSize(cp, COLS[1].w - 4), colX(1) + 2, y + 5);

  const descLines = doc.splitTextToSize((transaction.description || '—').trim(), COLS[2].w - 4);
  doc.text(descLines, colX(2) + 2, y + 5);

  if (transaction.sens === 'sortie') {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED_DARK);
    doc.text(formatPdfMAD(transaction.montant), colX(3) + COLS[3].w - 2, y + 5, { align: 'right' });
  }

  if (transaction.sens === 'entree') {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN_DARK);
    doc.text(formatPdfMAD(transaction.montant), colX(4) + COLS[4].w - 2, y + 5, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  const pay = (transaction.mode_paiement || '—').trim();
  doc.text(doc.splitTextToSize(pay, COLS[5].w - 4), colX(5) + 2, y + 5);

  return y + rowH;
}

function drawMiniPageTitle(doc, title) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(title, MARGIN, 18);
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN, 20, PAGE_W - MARGIN, 20);
}

function drawPageFooter(doc, pageNum, pageTotal, { notes, generatedAt }) {
  const lineY = FOOTER_Y;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, lineY, PAGE_W - MARGIN, lineY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);

  if (notes) {
    const noteLines = doc.splitTextToSize(`Notes : ${notes}`, CONTENT_W * 0.55);
    doc.text(noteLines, MARGIN, lineY + 5);
  }

  doc.text(`Généré le ${generatedAt}`, PAGE_W - MARGIN, lineY + 5, { align: 'right' });

  const sigY = lineY + 14;
  doc.setDrawColor(180, 180, 180);
  doc.line(MARGIN, sigY, MARGIN + 55, sigY);
  doc.line(PAGE_W - MARGIN - 55, sigY, PAGE_W - MARGIN, sigY);

  doc.setFontSize(7.5);
  doc.text('Signature / validation', MARGIN, sigY + 4);
  doc.text(`Page ${pageNum} / ${pageTotal}`, PAGE_W - MARGIN, sigY + 4, { align: 'right' });
}

export async function exportCashSheetPdf({ year, month, transactions, totals, balance }) {
  const periodLabel = `${MOIS[month] || month} ${year}`;
  const title = `FEUILLE DE CAISSE — ${periodLabel}`;
  const generatedAt = formatGeneratedAt();
  const notes = balance?.notes?.trim() || '';

  const logo = await loadCompanyLogo();
  let logoSize = { w: 34, h: 14 };
  if (logo) {
    logoSize = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(34 / img.naturalWidth, 14 / img.naturalHeight);
        resolve({ w: img.naturalWidth * ratio, h: img.naturalHeight * ratio });
      };
      img.onerror = () => resolve({ w: 34, h: 14 });
      img.src = logo;
    });
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  drawCompanyHeader(doc, logo, logoSize);
  drawTitle(doc, title);
  drawSummaryBox(doc, totals);

  let y = TABLE_TOP_FIRST;
  y = drawTableHeader(doc, y);

  const rows = transactions || [];
  let rowIndex = 0;

  rows.forEach((t) => {
    const rowH = measureRowHeight(doc, t);
    if (y + rowH > TABLE_BOTTOM) {
      doc.addPage();
      drawMiniPageTitle(doc, title);
      y = drawTableHeader(doc, TABLE_TOP_NEXT);
    }
    y = drawTableRow(doc, y, t, rowIndex);
    rowIndex += 1;
  });

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Aucune opération sur cette période.', MARGIN, y + 8);
  }

  const pageTotal = doc.getNumberOfPages();
  for (let p = 1; p <= pageTotal; p += 1) {
    doc.setPage(p);
    drawPageFooter(doc, p, pageTotal, { notes, generatedAt });
  }

  doc.save(`feuille-caisse-${year}-${String(month).padStart(2, '0')}.pdf`);
}
