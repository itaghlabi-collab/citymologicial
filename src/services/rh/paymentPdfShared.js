/**
 * paymentPdfShared.js — Mise en page PDF paiements CITYMO (A4)
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogoFit, formatPdfMAD, TEXT, MUTED, RED, BORDER, FINANCE_COMPANY } from '../finance/pdfShared';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return String(iso); }
}

const LOGO_X = 14;
const LOGO_Y = 10;
const LOGO_MAX_W = 42;
const LOGO_MAX_H = 16;

/** @returns {number} Y de départ du titre (sous le logo) */
async function addLogo(doc) {
  const logo = await loadCompanyLogoFit(LOGO_MAX_W, LOGO_MAX_H);
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h);
    return LOGO_Y + logo.h + 8;
  }
  return 28;
}

function addHeader(doc, title, subtitle, titleY = 28) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...RED);
  doc.text(title, LOGO_X, titleY);
  let lineY = titleY + 6;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, LOGO_X, titleY + 6);
    lineY = titleY + 10;
  }
  doc.setDrawColor(...BORDER);
  doc.line(LOGO_X, lineY + 2, 196, lineY + 2);
  return lineY + 6;
}

function addMetaGrid(doc, y, pairs) {
  doc.setFontSize(9);
  pairs.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(String(label), 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(String(value ?? '—'), 120);
    doc.text(lines, 62, y);
    y += Math.max(6, lines.length * 4.5);
  });
  return y + 4;
}

function addTable(doc, y, headers, rows, colWidths) {
  const startX = 14;
  const rowH = 7;
  doc.setFillColor(245, 245, 245);
  doc.rect(startX, y - 4, colWidths.reduce((a, b) => a + b, 0), rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT);
  let x = startX + 2;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colWidths[i];
  });
  y += rowH;
  doc.setFont('helvetica', 'normal');
  rows.forEach((row) => {
    x = startX + 2;
    row.forEach((cell, i) => {
      const txt = doc.splitTextToSize(String(cell ?? '—'), colWidths[i] - 4);
      doc.text(txt, x, y);
      x += colWidths[i];
    });
    y += rowH;
  });
  return y + 4;
}

function addTotals(doc, y, lines) {
  const boxW = 90;
  const boxX = 196 - boxW;
  doc.setDrawColor(...BORDER);
  doc.setFillColor(252, 252, 252);
  doc.roundedRect(boxX, y, boxW, 8 + lines.length * 7, 2, 2, 'FD');
  y += 6;
  lines.forEach(([label, value, bold, color]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9);
    if (color) doc.setTextColor(...color); else doc.setTextColor(...TEXT);
    doc.text(label, boxX + 4, y);
    doc.text(String(value), boxX + boxW - 4, y, { align: 'right' });
    y += 7;
  });
  return y + 8;
}

function addSignatures(doc, y) {
  if (y > 240) {
    doc.addPage();
    y = 30;
  }
  y = Math.max(y, 230);
  doc.setDrawColor(...BORDER);
  doc.line(14, y, 80, y);
  doc.line(120, y, 186, y);
  doc.line(14, y + 18, 80, y + 18);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Signature bénéficiaire', 14, y + 5);
  doc.text('Signature responsable', 120, y + 5);
  doc.text('Cachet société', 14, y + 23);
  doc.setFontSize(7);
  doc.text(`${FINANCE_COMPANY.name} — ${FINANCE_COMPANY.address}`, 14, 287);
}

/**
 * @param {object} opts
 */
export async function generatePaymentVoucherPdf(opts) {
  const {
    title,
    subtitle,
    filename,
    meta = [],
    detailHeaders,
    detailRows,
    detailColWidths = [70, 35, 35, 46],
    secondaryTitle = 'Détail des présences',
    secondaryHeaders,
    secondaryRows,
    secondaryColWidths,
    totals = [],
    observations = '',
    print = false,
  } = opts;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const titleY = await addLogo(doc);
  let y = addHeader(doc, title, subtitle, titleY);
  y = addMetaGrid(doc, y, meta);

  if (detailHeaders?.length && detailRows?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text('Récapitulatif paiement', 14, y);
    y += 5;
    y = addTable(doc, y, detailHeaders, detailRows, detailColWidths);
  }

  if (secondaryHeaders?.length && secondaryRows?.length) {
    if (y > 240) {
      doc.addPage();
      y = 30;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text(secondaryTitle, 14, y);
    y += 5;
    y = addTable(doc, y, secondaryHeaders, secondaryRows, secondaryColWidths || detailColWidths);
  }

  if (totals.length) {
    y = addTotals(doc, y, totals);
  }

  if (observations) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Observations', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const obs = doc.splitTextToSize(observations, 182);
    doc.text(obs, 14, y);
    y += obs.length * 4.5 + 4;
  }

  addSignatures(doc, y);

  if (print) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(filename || 'paiement-citymo.pdf');
  }
}

export { fmtDate, formatPdfMAD };
