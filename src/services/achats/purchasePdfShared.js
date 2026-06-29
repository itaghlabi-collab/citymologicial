/**
 * purchasePdfShared.js — Utilitaires PDF module Achats CITYMO
 */
import { jsPDF } from 'jspdf';
import { formatPdfMAD, loadCompanyLogoFit } from '../finance/pdfShared';

export const PDF_RED = [198, 40, 40];
export const PDF_TEXT = [33, 33, 33];
export const PDF_MUTED = [100, 100, 100];
export const PDF_BORDER = [200, 200, 200];
export const PDF_ROW_GRAY = [245, 245, 245];

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 14;
export const CONTENT_W = PAGE_W - MARGIN * 2;

const COMPANY_LINES = [
  '228 Bd Mohammed V, Casablanca 20000',
  'Tél : +212 52 231 0043',
  'contact@citymo.ma',
];

export function dash(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

export function fmtDate(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    }
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

export function safeFilename(ref, prefix) {
  const slug = String(ref || 'doc')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ.-]/gi, '')
    || 'doc';
  return `${prefix}-${slug}.pdf`;
}

export function downloadPdfBlob(blob, filename) {
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

export function createAchatsPdfDoc() {
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
}

/** En-tête CITYMO : logo à gauche, titre rouge à droite, ligne rouge */
export async function drawAchatsHeader(doc, title, metaRows = []) {
  const logo = await loadCompanyLogoFit(42, 16);
  let y = MARGIN;

  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, y, logo.w, logo.h);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_MUTED);
  let infoY = y + 2;
  COMPANY_LINES.forEach((line) => {
    doc.text(line, MARGIN + 48, infoY);
    infoY += 3.6;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_RED);
  doc.text(title, PAGE_W - MARGIN, y + 8, { align: 'right' });

  y = Math.max(y + 20, infoY + 2);

  if (metaRows.length) {
    doc.setFontSize(8.5);
    metaRows.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? MARGIN : MARGIN + CONTENT_W / 2;
      const my = y + row * 5.5;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF_MUTED);
      doc.text(`${label} :`, x, my);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_TEXT);
      doc.text(dash(value), x + 28, my);
    });
    y += Math.ceil(metaRows.length / 2) * 5.5 + 4;
  }

  doc.setDrawColor(...PDF_RED);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 8;
}

export function drawSectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_RED);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...PDF_RED);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  return y + 8;
}

export function drawKeyValueTable(doc, rows, startY) {
  const col1W = CONTENT_W * 0.36;
  const col2W = CONTENT_W - col1W;
  let y = startY;

  rows.forEach(([label, value]) => {
    const val = dash(value);
    doc.setFontSize(9);
    const valueLines = val === '—' ? ['—'] : doc.splitTextToSize(val, col2W - 6);
    const rowH = Math.max(7, valueLines.length * 4 + 3);

    doc.setFillColor(...PDF_ROW_GRAY);
    doc.rect(MARGIN, y, col1W, rowH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN + col1W, y, col2W, rowH, 'F');
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_W, rowH);
    doc.line(MARGIN + col1W, y, MARGIN + col1W, y + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_MUTED);
    doc.text(label, MARGIN + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_TEXT);
    doc.text(valueLines, MARGIN + col1W + 3, y + 5);
    y += rowH;
  });

  return y + 4;
}

/** Tableau à colonnes */
export function drawDataTable(doc, columns, rows, startY) {
  const totalW = CONTENT_W;
  const colWidths = columns.map((c) => c.width || totalW / columns.length);
  const sumW = colWidths.reduce((a, b) => a + b, 0);
  const scale = totalW / sumW;
  const widths = colWidths.map((w) => w * scale);

  let y = startY;
  const headerH = 8;

  doc.setFillColor(...PDF_RED);
  doc.rect(MARGIN, y, totalW, headerH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  let x = MARGIN;
  columns.forEach((col, i) => {
    doc.text(col.label, x + 2, y + 5.5);
    x += widths[i];
  });
  y += headerH;

  rows.forEach((row, ri) => {
    doc.setFontSize(8);
    const cellTexts = columns.map((col, i) => {
      const raw = row[col.key];
      const val = col.format ? col.format(raw, row) : dash(raw);
      return doc.splitTextToSize(String(val), widths[i] - 4);
    });
    const rowH = Math.max(7, ...cellTexts.map((t) => t.length * 3.8 + 2));

    if (ri % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(...PDF_ROW_GRAY);

    x = MARGIN;
    columns.forEach((_, i) => {
      doc.rect(x, y, widths[i], rowH, 'F');
      doc.setDrawColor(...PDF_BORDER);
      doc.setLineWidth(0.12);
      doc.rect(x, y, widths[i], rowH);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_TEXT);
      doc.text(cellTexts[i], x + 2, y + 4.5);
      x += widths[i];
    });
    y += rowH;
  });

  return y + 6;
}

export function drawSignatureBoxes(doc, labels, startY, boxH = 22) {
  const gap = 6;
  const boxW = (CONTENT_W - gap * (labels.length - 1)) / labels.length;
  let y = startY;

  labels.forEach((label, i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(x, y, boxW, boxH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(label, x + boxW / 2, y + boxH + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Date : _______________', x + boxW / 2, y + boxH + 9, { align: 'center' });
  });

  return y + boxH + 14;
}

export function drawFooter(doc, text) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_MUTED);
  doc.text(text, PAGE_W / 2, PAGE_H - 10, { align: 'center' });
}

export function normalizeRequestLines(request) {
  const lines = request?.payload?.lines || request?.lines || [];
  if (!lines.length && request?.titre) {
    return [{
      designation: request.titre,
      quantite: '—',
      unite: '—',
      observation: request.description || '—',
    }];
  }
  return lines.map((l) => ({
    designation: l.designation || l.article_name || l.libelle || l.titre || '—',
    quantite: l.quantite ?? l.quantite_demandee ?? l.qty ?? '—',
    unite: l.unite || l.unit || 'u',
    observation: l.observation || l.observations || l.rupture ? 'Rupture stock' : '—',
  }));
}

export function normalizeOaLines(oa) {
  const lines = oa?.lines || [];
  if (!lines.length) {
    return [{
      designation: oa?.objet || '—',
      quantite: 1,
      prix_unitaire: oa?.montant_ht || 0,
      total_ht: oa?.montant_ht || 0,
    }];
  }
  return lines.map((l) => {
    const qty = Number(l.quantite ?? l.qty ?? 1) || 1;
    const pu = Number(l.prix_unitaire ?? l.prix_ht ?? l.montant_ht) || 0;
    return {
      designation: l.designation || l.article_name || l.libelle || '—',
      quantite: qty,
      prix_unitaire: pu,
      total_ht: Number(l.total_ht ?? l.montant_ht) || qty * pu,
    };
  });
}

export { formatPdfMAD };
