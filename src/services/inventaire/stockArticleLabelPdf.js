/**
 * stockArticleLabelPdf.js — Étiquettes compactes dépôt (désignation + code-barres + code)
 */
import { jsPDF } from 'jspdf';
import {
  getArticleBarcodeValue,
  renderBarcodeForPrint,
  containBarcodeMm,
} from './barcodeUtils';

const TEXT = [0, 0, 0];
const A4_W = 210;
const A4_H = 297;

export const LABEL_FORMATS = {
  small: { key: 'small', width: 50, height: 30, name: '50×30 mm' },
  standard: { key: 'standard', width: 80, height: 50, name: '80×50 mm' },
};

const A4_GRID = {
  standard: { cols: 2, rows: 5 },
  small: { cols: 4, rows: 9 },
};

function resolveFormat(formatOrLegacy) {
  if (formatOrLegacy && LABEL_FORMATS[formatOrLegacy]) return formatOrLegacy;
  return 'standard';
}

function labelPad(formatKey) {
  return formatKey === 'small' ? 1.5 : 2;
}

function barcodePrintOpts(formatKey) {
  if (formatKey === 'small') {
    return { maxWidthPx: 360, barHeight: 64, margin: 4 };
  }
  return { maxWidthPx: 560, barHeight: 88, margin: 6 };
}

/** jsPDF portrait inverse W/H si largeur > hauteur — forcer landscape pour nos étiquettes. */
function createLabelPdf(fmt) {
  const landscape = fmt.width >= fmt.height;
  return new jsPDF({
    unit: 'mm',
    format: [fmt.width, fmt.height],
    orientation: landscape ? 'landscape' : 'portrait',
    compress: true,
  });
}

function drawLabelOnDoc(doc, x, y, article, formatKey) {
  const fmt = LABEL_FORMATS[formatKey] || LABEL_FORMATS.standard;
  const W = fmt.width;
  const H = fmt.height;
  const pad = labelPad(formatKey);
  const contentW = W - pad * 2;
  const centerX = x + W / 2;
  const code = getArticleBarcodeValue(article);
  const designation = String(article.designation || article.nom || '—').trim();

  doc.setTextColor(...TEXT);

  const desFontSize = formatKey === 'small' ? 5 : 6.5;
  const maxDesLines = formatKey === 'small' ? 2 : 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(desFontSize);
  const desLines = doc.splitTextToSize(designation.toUpperCase(), contentW).slice(0, maxDesLines);
  const lineH = desFontSize * 0.45;
  let cy = y + pad + lineH * 0.85;
  desLines.forEach((line) => {
    doc.text(line, centerX, cy, { align: 'center', baseline: 'middle' });
    cy += lineH;
  });

  const codeFontSize = formatKey === 'small' ? 6.5 : 8;
  const codeY = y + H - pad - 0.5;
  const barcodeTop = cy + (formatKey === 'small' ? 0.6 : 1);
  const barcodeMaxH = Math.max(formatKey === 'small' ? 9 : 13, codeY - codeFontSize * 0.4 - barcodeTop - 0.8);
  const barcodeMaxW = contentW * 0.94;

  const barcodeMeta = renderBarcodeForPrint(code, barcodePrintOpts(formatKey));
  if (barcodeMeta?.bars?.length) {
    const size = containBarcodeMm(barcodeMeta, barcodeMaxW, barcodeMaxH);
    const imgX = x + (W - size.width) / 2;
    const imgY = barcodeTop + (barcodeMaxH - size.height) / 2;
    const k = size.width / barcodeMeta.pxW;
    doc.setFillColor(0, 0, 0);
    barcodeMeta.bars.forEach((b) => {
      doc.rect(imgX + b.x * k, imgY + barcodeMeta.barTop * k, b.w * k, barcodeMeta.barHeight * k, 'F');
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(codeFontSize);
  doc.text(code || '—', centerX, codeY, { align: 'center', baseline: 'bottom' });
}

function safeFilename(code) {
  return (code || 'article').replace(/[^\w-]+/g, '-');
}

function buildA4Doc(articles, formatKey) {
  const fmt = LABEL_FORMATS[formatKey];
  const grid = A4_GRID[formatKey] || A4_GRID.standard;
  const perPage = grid.cols * grid.rows;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

  const gapX = (A4_W - grid.cols * fmt.width) / (grid.cols + 1);
  const gapY = (A4_H - grid.rows * fmt.height) / (grid.rows + 1);

  articles.forEach((article, idx) => {
    if (idx > 0 && idx % perPage === 0) doc.addPage();
    const pageIdx = idx % perPage;
    const col = pageIdx % grid.cols;
    const row = Math.floor(pageIdx / grid.cols);
    const lx = gapX + col * (fmt.width + gapX);
    const ly = gapY + row * (fmt.height + gapY);
    drawLabelOnDoc(doc, lx, ly, article, formatKey);
  });

  return doc;
}

export function downloadStockArticleLabel(article, formatOrLegacy = 'standard') {
  const formatKey = resolveFormat(formatOrLegacy);
  const fmt = LABEL_FORMATS[formatKey];
  const doc = createLabelPdf(fmt);
  drawLabelOnDoc(doc, 0, 0, article, formatKey);
  doc.save(`etiquette-${formatKey}-${safeFilename(getArticleBarcodeValue(article))}.pdf`);
}

export function downloadStockArticleLabelsA4(articles = [], formatOrLegacy = 'standard') {
  if (!articles.length) return;
  const formatKey = resolveFormat(formatOrLegacy);
  if (articles.length === 1) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    drawLabelOnDoc(doc, 10, 10, articles[0], formatKey);
    doc.save(`planche-a4-${formatKey}-${safeFilename(getArticleBarcodeValue(articles[0]))}.pdf`);
    return;
  }
  const doc = buildA4Doc(articles, formatKey);
  doc.save(`planche-a4-${formatKey}-${articles.length}-etiquettes.pdf`);
}

export function downloadStockArticleLabels(articles = [], formatOrLegacy = 'standard') {
  return downloadStockArticleLabelsA4(articles, formatOrLegacy);
}

/** Impression bouton rouge = PDF 80×50 : nom + CODE128, sans QR ni URL. */
export function printStockArticleLabel(article) {
  const formatKey = 'standard';
  const fmt = LABEL_FORMATS.standard;
  const doc = createLabelPdf(fmt);
  drawLabelOnDoc(doc, 0, 0, article, formatKey);
  doc.autoPrint();
  const url = doc.output('bloburl');
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    downloadStockArticleLabel(article, formatKey);
  }
}

export function printStockArticleLabels(articles = [], formatOrLegacy = 'standard') {
  if (!articles.length) return;
  if (articles.length === 1) {
    printStockArticleLabel(articles[0]);
    return;
  }
  downloadStockArticleLabelsA4(articles, formatOrLegacy);
}
