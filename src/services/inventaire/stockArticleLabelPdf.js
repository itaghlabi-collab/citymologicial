/**
 * stockArticleLabelPdf.js — Étiquettes compactes dépôt (désignation + code-barres + code)
 */
import { jsPDF } from 'jspdf';
import {
  getArticleBarcodeValue,
  renderBarcodeForPrint,
  containBarcodeMm,
  getArticlePublicUrl,
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
  if (barcodeMeta?.dataUrl) {
    const size = containBarcodeMm(barcodeMeta, barcodeMaxW, barcodeMaxH);
    const imgX = x + (W - size.width) / 2;
    const imgY = barcodeTop + (barcodeMaxH - size.height) / 2;
    try {
      doc.addImage(barcodeMeta.dataUrl, 'PNG', imgX, imgY, size.width, size.height, undefined, 'FAST');
    } catch { /* skip */ }
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

function printHtml(article, formatKey, qrDataUrl = '') {
  const fmt = LABEL_FORMATS[formatKey] || LABEL_FORMATS.standard;
  const code = getArticleBarcodeValue(article);
  const designation = String(article.designation || article.nom || '—').trim().toUpperCase();
  const barcodeMeta = renderBarcodeForPrint(code, barcodePrintOpts(formatKey));

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const desSize = formatKey === 'small' ? '7px' : '9px';
  const codeSize = formatKey === 'small' ? '9px' : '10px';
  const qrSize = formatKey === 'small' ? '14mm' : '18mm';

  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=520');
  if (!w) return false;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(code)}</title>
<style>
  @page { size: ${fmt.width}mm ${fmt.height}mm; margin: 1.2mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${fmt.width}mm; height: ${fmt.height}mm; overflow: hidden;
    font-family: Helvetica, Arial, sans-serif; color: #000;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    text-align: center; padding: 1.2mm;
  }
  .designation { font-weight: 800; font-size: ${desSize}; line-height: 1.15; width: 100%; }
  .codes { display: flex; align-items: center; justify-content: center; gap: 2mm; width: 100%; flex: 1; min-height: 0; }
  .barcode-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .barcode-wrap img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
  .qr-wrap img { width: ${qrSize}; height: ${qrSize}; }
  .code { font-weight: 800; font-size: ${codeSize}; letter-spacing: 0.08em; }
</style></head><body>
  <div class="designation">${esc(designation)}</div>
  <div class="codes">
    <div class="barcode-wrap">${barcodeMeta?.dataUrl ? `<img src="${barcodeMeta.dataUrl}" alt="${esc(code)}" />` : ''}</div>
    ${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" alt="QR" /></div>` : ''}
  </div>
  <div class="code">${esc(code)}</div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body></html>`);
  w.document.close();
  return true;
}

export async function printStockArticleLabel(article, formatOrLegacy = 'standard') {
  const formatKey = resolveFormat(formatOrLegacy);
  let qrDataUrl = '';
  try {
    const QRCode = (await import('qrcode')).default;
    qrDataUrl = await QRCode.toDataURL(getArticlePublicUrl(getArticleBarcodeValue(article)), { width: 96, margin: 0 });
  } catch {
    /* QR optionnel */
  }
  if (!printHtml(article, formatKey, qrDataUrl)) {
    downloadStockArticleLabel(article, formatKey);
  }
}

export function printStockArticleLabels(articles = [], formatOrLegacy = 'standard') {
  if (!articles.length) return;
  if (articles.length === 1) {
    printStockArticleLabel(articles[0], formatOrLegacy);
    return;
  }
  downloadStockArticleLabelsA4(articles, formatOrLegacy);
}
