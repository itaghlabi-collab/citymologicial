/**
 * stockArticleLabelPdf.js — Étiquettes compactes dépôt (désignation + code-barres + code)
 */
import { jsPDF } from 'jspdf';
import {
  getArticleBarcodeValue,
  renderBarcodeForPrint,
  containBarcodeMm,
  getArticlePublicUrl,
  drawCode128Bars,
} from './barcodeUtils';

const TEXT = [0, 0, 0];
const A4_W = 210;
const A4_H = 297;

export const LABEL_FORMATS = {
  small: { key: 'small', width: 50, height: 30, name: '50×30 mm' },
  standard: { key: 'standard', width: 80, height: 50, name: '80×50 mm' },
  /** Rouleau thermique DT325B / JT 80DW — étiquette 6,5 × 4,8 cm (paysage). */
  thermal: { key: 'thermal', width: 65, height: 48, name: '65×48 mm' },
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
  if (formatKey === 'small') return 1.5;
  return 2;
}

function barcodePrintOpts(formatKey) {
  if (formatKey === 'small') {
    return { maxWidthPx: 360, barHeight: 64, margin: 4 };
  }
  if (formatKey === 'thermal') {
    return { maxWidthPx: 480, barHeight: 72, margin: 4 };
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

/** 203 dpi (8 dots/mm) — résolution native DT325B / JT 80DW. */
const THERMAL_DOTS_PER_MM = 8;
/** Hauteur de barres CODE128 1D standard (20 mm) — pas toute la colonne gauche. */
const THERMAL_BAR_H_MM = 20;
const THERMAL_BAR_H_PX = THERMAL_BAR_H_MM * THERMAL_DOTS_PER_MM; // 160 px @ 203 dpi

function wrapCanvasLines(ctx, text, maxWidth, maxLines) {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw) return ['—'];
  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';
  const push = (s) => {
    if (s) lines.push(s);
  };
  for (const word of words) {
    if (lines.length >= maxLines) break;
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      continue;
    }
    push(current);
    current = '';
    if (lines.length >= maxLines) break;
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
    } else {
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width <= maxWidth) chunk += ch;
        else {
          push(chunk);
          chunk = ch;
          if (lines.length >= maxLines) break;
        }
      }
      current = chunk;
    }
  }
  push(current);
  return lines.filter(Boolean).slice(0, maxLines);
}

async function renderThermalLabelPng(article) {
  const fmt = LABEL_FORMATS.thermal;
  const W = Math.round(fmt.width * THERMAL_DOTS_PER_MM);
  const H = Math.round(fmt.height * THERMAL_DOTS_PER_MM);
  const pad = 16; // 2 mm — zone de silence / évite le clipping au bord
  const colGap = 12;
  const code = getArticleBarcodeValue(article);
  const designation = String(article.designation || article.nom || '—').trim();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';

  /** Colonne droite bornée pour laisser ≥334 px au CODE128 (modules 2 px, sans débord). */
  const rightColW = 132;
  const codeFont = 18;
  const codeBoxH = 22;
  const codeGap = 6;
  const barH = THERMAL_BAR_H_PX;
  const barX = pad;
  const barW = W - pad * 2 - rightColW - colGap;
  const rightX = pad + barW + colGap;

  const leftColH = H - pad * 2;
  const stackH = barH + codeGap + codeBoxH;
  const stackY = pad + Math.max(0, Math.floor((leftColH - stackH) / 2));
  const barY = stackY;

  drawCode128Bars(ctx, code, { x: barX, y: barY, maxWidth: barW, height: barH });

  ctx.font = `bold ${codeFont}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(code || '—', barX + Math.floor(barW / 2), stackY + stackH);

  const nameFont = 20;
  const nameLineH = 24;
  ctx.font = `bold ${nameFont}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = wrapCanvasLines(ctx, designation, rightColW, 2);
  let nameY = pad;
  lines.forEach((line) => {
    ctx.fillText(line, rightX, nameY);
    nameY += nameLineH;
  });

  const qrY = nameY + 8;
  const qrSize = Math.max(96, Math.min(rightColW, H - pad - qrY));

  try {
    const QRCode = (await import('qrcode')).default;
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, getArticlePublicUrl(code), {
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    ctx.drawImage(qrCanvas, rightX, qrY);
  } catch {
    /* QR optionnel */
  }

  return canvas.toDataURL('image/png');
}

function printThermalPng(pngDataUrl) {
  const fmt = LABEL_FORMATS.thermal;
  const prevFocus = document.activeElement;
  document.querySelectorAll('iframe[data-citymo-label-print]').forEach((el) => el.remove());
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-citymo-label-print', '1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${fmt.width}mm;height:${fmt.height}mm;border:0;`;
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) {
    iframe.remove();
    return false;
  }

  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>etiquette</title>
<style>
  @page { size: ${fmt.width}mm ${fmt.height}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${fmt.width}mm; height: ${fmt.height}mm; overflow: hidden; background: #fff; }
  img {
    display: block; width: ${fmt.width}mm; height: ${fmt.height}mm;
    image-rendering: pixelated; image-rendering: crisp-edges;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
</style></head><body>
  <img src="${pngDataUrl}" alt="etiquette" />
</body></html>`);
  w.document.close();

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    window.removeEventListener('focus', restore);
    try { iframe.remove(); } catch { /* already gone */ }
    const scan = document.querySelector('input[aria-label="Scanner un article"]');
    const el = (prevFocus && document.contains(prevFocus) && prevFocus.focus)
      ? prevFocus
      : scan;
    try { el?.focus?.(); } catch { /* ignore */ }
  };

  const img = w.document.querySelector('img');
  const launch = () => {
    w.addEventListener('afterprint', restore, { once: true });
    window.addEventListener('focus', restore);
    try {
      w.print();
    } finally {
      setTimeout(restore, 400);
    }
  };
  if (!img || img.complete) {
    requestAnimationFrame(launch);
  } else {
    img.onload = launch;
    img.onerror = launch;
  }
  return true;
}

/** Impression thermique 65×48 mm : CODE128 horizontal à gauche, nom + QR à droite (bitmap 203 dpi). */
export async function printStockArticleLabel(article) {
  const png = await renderThermalLabelPng(article);
  if (!printThermalPng(png)) {
    downloadStockArticleLabel(article, 'thermal');
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
