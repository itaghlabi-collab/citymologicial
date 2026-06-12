/**
 * paymentPdfShared.js — Mise en page PDF paiements CITYMO (A4)
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogo, formatPdfMAD, TEXT, MUTED, RED, BORDER, FINANCE_COMPANY } from '../finance/pdfShared';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return String(iso); }
}

async function addLogo(doc) {
  const logo = await loadCompanyLogo();
  if (logo) {
    doc.addImage(logo, 'PNG', 14, 10, 38, 14);
  }
}

function addHeader(doc, title, subtitle) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...RED);
  doc.text(title, 14, 32);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, 14, 38);
  }
  doc.setDrawColor(...BORDER);
  doc.line(14, 42, 196, 42);
  return 46;
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
    totals = [],
    observations = '',
    print = false,
  } = opts;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await addLogo(doc);
  let y = addHeader(doc, title, subtitle);
  y = addMetaGrid(doc, y, meta);

  if (detailHeaders?.length && detailRows?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text('Détail du calcul', 14, y);
    y += 5;
    y = addTable(doc, y, detailHeaders, detailRows, detailColWidths);
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
