/**
 * stockArticleLabelPdf.js — Étiquettes compactes dépôt (désignation + code-barres + code)
 */
import { jsPDF } from 'jspdf';
import { getArticleBarcodeValue, renderBarcodeDataUrl } from './barcodeUtils';

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

function barcodeRenderOpts(formatKey) {
  if (formatKey === 'small') {
    return { height: 72, width: 2.4, scale: 4, displayValue: false, margin: 1, textMargin: 0 };
  }
  return { height: 110, width: 2.8, scale: 4, displayValue: false, margin: 2, textMargin: 0 };
}

function drawLabelOnDoc(doc, x, y, article, formatKey) {
  const fmt = LABEL_FORMATS[formatKey] || LABEL_FORMATS.standard;
  const { width: W, height: H } = fmt;
  const pad = labelPad(formatKey);
  const contentW = W - pad * 2;
  const code = getArticleBarcodeValue(article);
  const designation = String(article.designation || article.nom || '—').trim();

  doc.setTextColor(...TEXT);

  const desFontSize = formatKey === 'small' ? 5 : 7;
  const maxDesLines = formatKey === 'small' ? 2 : 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(desFontSize);
  const desLines = doc.splitTextToSize(designation, contentW).slice(0, maxDesLines);
  const lineH = desFontSize * 0.42;
  let cy = y + pad + lineH;
  desLines.forEach((line) => {
    doc.text(line, x + W / 2, cy, { align: 'center' });
    cy += lineH;
  });

  const codeFontSize = formatKey === 'small' ? 6.5 : 8.5;
  const codeY = y + H - pad;
  const barcodeTop = cy + (formatKey === 'small' ? 0.8 : 1.2);
  const barcodeBottom = codeY - codeFontSize * 0.35 - 0.8;
  const barcodeH = Math.max(formatKey === 'small' ? 10 : 14, barcodeBottom - barcodeTop);

  const barcodeUrl = renderBarcodeDataUrl(code, barcodeRenderOpts(formatKey));
  if (barcodeUrl) {
    const imgW = contentW * 0.96;
    try {
      doc.addImage(barcodeUrl, 'PNG', x + (W - imgW) / 2, barcodeTop, imgW, barcodeH);
    } catch { /* skip */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(codeFontSize);
  doc.text(code || '—', x + W / 2, codeY, { align: 'center' });
}

function safeFilename(code) {
  return (code || 'article').replace(/[^\w-]+/g, '-');
}

function buildA4Doc(articles, formatKey) {
  const fmt = LABEL_FORMATS[formatKey];
  const grid = A4_GRID[formatKey] || A4_GRID.standard;
  const perPage = grid.cols * grid.rows;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

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

/** Télécharge une étiquette unitaire (50×30 ou 80×50). */
export function downloadStockArticleLabel(article, formatOrLegacy = 'standard') {
  const formatKey = resolveFormat(formatOrLegacy);
  const fmt = LABEL_FORMATS[formatKey];
  const doc = new jsPDF({
    unit: 'mm',
    format: [fmt.width, fmt.height],
    orientation: 'portrait',
  });
  drawLabelOnDoc(doc, 0, 0, article, formatKey);
  doc.save(`etiquette-${formatKey}-${safeFilename(getArticleBarcodeValue(article))}.pdf`);
}

/** Planche A4 multi-étiquettes. */
export function downloadStockArticleLabelsA4(articles = [], formatOrLegacy = 'standard') {
  if (!articles.length) return;
  const formatKey = resolveFormat(formatOrLegacy);
  if (articles.length === 1) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const fmt = LABEL_FORMATS[formatKey];
    drawLabelOnDoc(doc, 10, 10, articles[0], formatKey);
    doc.save(`planche-a4-${formatKey}-${safeFilename(getArticleBarcodeValue(articles[0]))}.pdf`);
    return;
  }
  const doc = buildA4Doc(articles, formatKey);
  doc.save(`planche-a4-${formatKey}-${articles.length}-etiquettes.pdf`);
}

/** Sélection multiple → planche A4 (format standard par défaut). */
export function downloadStockArticleLabels(articles = [], formatOrLegacy = 'standard') {
  return downloadStockArticleLabelsA4(articles, formatOrLegacy);
}

function printHtml(article, formatKey) {
  const fmt = LABEL_FORMATS[formatKey] || LABEL_FORMATS.standard;
  const code = getArticleBarcodeValue(article);
  const designation = String(article.designation || article.nom || '—').trim();
  const barcodeUrl = renderBarcodeDataUrl(code, {
    ...barcodeRenderOpts(formatKey),
    scale: 3,
  });

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const desSize = formatKey === 'small' ? '8px' : '11px';
  const codeSize = formatKey === 'small' ? '9px' : '11px';

  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=520');
  if (!w) return false;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(code)}</title>
<style>
  @page { size: ${fmt.width}mm ${fmt.height}mm; margin: 1.5mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.5mm; width: ${fmt.width}mm; min-height: ${fmt.height}mm;
    font-family: Helvetica, Arial, sans-serif; color: #000;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    text-align: center;
  }
  .designation { font-weight: 800; font-size: ${desSize}; line-height: 1.2; width: 100%; }
  .barcode-wrap { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; padding: 1mm 0; }
  .barcode-wrap img { max-width: 96%; max-height: 100%; height: auto; image-rendering: pixelated; }
  .code { font-weight: 800; font-size: ${codeSize}; letter-spacing: 0.06em; }
</style></head><body>
  <div class="designation">${esc(designation)}</div>
  <div class="barcode-wrap">${barcodeUrl ? `<img src="${barcodeUrl}" alt="${esc(code)}" />` : ''}</div>
  <div class="code">${esc(code)}</div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body></html>`);
  w.document.close();
  return true;
}

/** Impression navigateur — étiquette unitaire. */
export function printStockArticleLabel(article, formatOrLegacy = 'standard') {
  const formatKey = resolveFormat(formatOrLegacy);
  if (!printHtml(article, formatKey)) {
    downloadStockArticleLabel(article, formatKey);
  }
}

/** Impression / PDF pour sélection multiple. */
export function printStockArticleLabels(articles = [], formatOrLegacy = 'standard') {
  if (!articles.length) return;
  if (articles.length === 1) {
    printStockArticleLabel(articles[0], formatOrLegacy);
    return;
  }
  downloadStockArticleLabelsA4(articles, formatOrLegacy);
}
