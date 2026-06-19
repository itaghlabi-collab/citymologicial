/**
 * stockArticleLabelPdf.js — Étiquettes code-barres CITYMO (unitaire, sélection, planche A4)
 */
import { jsPDF } from 'jspdf';
import { getArticleBarcodeValue, renderBarcodeDataUrl } from './barcodeUtils';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [90, 90, 90];

const LABEL_W = 100;
const LABEL_H = 70;
const M = 6;
const A4_W = 210;
const A4_H = 297;
const COLS = 2;
const ROWS = 4;

async function loadLogo() {
  try {
    const res = await fetch(LOGO_URL, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function truncate(doc, text, maxW) {
  const t = String(text || '').trim();
  if (!t) return '—';
  if (doc.getTextWidth(t) <= maxW) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function drawLabelOnDoc(doc, x, y, article, categoryName, logoDataUrl) {
  const code = getArticleBarcodeValue(article);
  const contentW = LABEL_W - M * 2;
  let ly = y + M + 2;

  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.25);
  doc.rect(x + 0.5, y + 0.5, LABEL_W - 1, LABEL_H - 1);

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', x + M, ly, 22, 8);
      ly += 10;
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...RED);
      doc.text('CITYMO', x + M, ly + 4);
      ly += 8;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...RED);
    doc.text('CITYMO', x + M, ly + 4);
    ly += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Code :', x + M, ly);
  doc.setTextColor(...TEXT);
  doc.text(code || '—', x + M + 14, ly);
  ly += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Désignation :', x + M, ly);
  ly += 3.8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT);
  const desLines = doc.splitTextToSize(article.designation || article.nom || '—', contentW);
  doc.text(desLines.slice(0, 2), x + M, ly);
  ly += desLines.length > 1 ? 7 : 4;

  const fields = [
    ['Catégorie', categoryName || '—'],
    ['État', article.etat || '—'],
    ['Emplacement', article.emplacement || '—'],
  ];
  fields.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(`${label} :`, x + M, ly);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(truncate(doc, value, contentW - 22), x + M + 22, ly);
    ly += 4;
  });

  const barcodeUrl = renderBarcodeDataUrl(code, { height: 36, width: 1.4, fontSize: 9, margin: 2 });
  if (barcodeUrl) {
    try {
      doc.addImage(barcodeUrl, 'PNG', x + M, y + LABEL_H - M - 16, contentW, 14);
    } catch { /* skip */ }
  }
}

function buildLabelMeta(article, getCategoryName) {
  const catName = typeof getCategoryName === 'function'
    ? getCategoryName(article)
    : (getCategoryName || '');
  return { article, categoryName: catName };
}

export async function downloadStockArticleLabel(article, categoryName = '') {
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'portrait' });
  drawLabelOnDoc(doc, 0, 0, article, categoryName, logo);
  const safe = (getArticleBarcodeValue(article) || 'article').replace(/[^\w-]+/g, '-');
  doc.save(`etiquette-${safe}.pdf`);
}

export async function downloadStockArticleLabels(articles = [], getCategoryName) {
  if (!articles.length) return;
  const logo = await loadLogo();
  if (articles.length === 1) {
    const { categoryName } = buildLabelMeta(articles[0], getCategoryName);
    return downloadStockArticleLabel(articles[0], categoryName);
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  articles.forEach((article, idx) => {
    if (idx > 0 && idx % (COLS * ROWS) === 0) doc.addPage();
    const pageIdx = idx % (COLS * ROWS);
    const col = pageIdx % COLS;
    const row = Math.floor(pageIdx / COLS);
    const marginX = (A4_W - COLS * LABEL_W) / (COLS + 1);
    const marginY = (A4_H - ROWS * LABEL_H) / (ROWS + 1);
    const x = marginX + col * (LABEL_W + marginX);
    const y = marginY + row * (LABEL_H + marginY);
    const { categoryName } = buildLabelMeta(article, getCategoryName);
    drawLabelOnDoc(doc, x, y, article, categoryName, logo);
  });
  doc.save(`etiquettes-articles-${articles.length}.pdf`);
}

export async function downloadStockArticleLabelsA4(articles = [], getCategoryName) {
  return downloadStockArticleLabels(articles, getCategoryName);
}

export async function printStockArticleLabel(article, categoryName = '') {
  const code = getArticleBarcodeValue(article);
  const barcodeUrl = renderBarcodeDataUrl(code, { height: 48, width: 2, fontSize: 12 });
  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=520');
  if (!w) {
    downloadStockArticleLabel(article, categoryName);
    return;
  }

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquette ${esc(code)}</title>
<style>
  @page { size: 100mm 70mm; margin: 4mm; }
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 8px; color: #212121; }
  .brand img { height: 28px; margin-bottom: 6px; }
  .field { font-size: 10px; margin-bottom: 3px; }
  .field strong { color: #5a5a5a; font-weight: 700; }
  img.barcode { max-width: 100%; height: auto; display: block; margin-top: 8px; }
</style></head><body>
  <div class="brand"><img src="${LOGO_URL}" alt="CITYMO" onerror="this.outerHTML='<strong style=color:#c62828>CITYMO</strong>'" /></div>
  <div class="field"><strong>Code :</strong> ${esc(code)}</div>
  <div class="field"><strong>Désignation :</strong> ${esc(article.designation || article.nom)}</div>
  <div class="field"><strong>Catégorie :</strong> ${esc(categoryName || '—')}</div>
  <div class="field"><strong>État :</strong> ${esc(article.etat || '—')}</div>
  <div class="field"><strong>Emplacement :</strong> ${esc(article.emplacement || '—')}</div>
  ${barcodeUrl ? `<img class="barcode" src="${barcodeUrl}" alt="${esc(code)}" />` : ''}
  <script>window.onload = function(){ window.focus(); window.print(); };</script>
</body></html>`);
  w.document.close();
}

export async function printStockArticleLabels(articles = [], getCategoryName) {
  if (!articles.length) return;
  if (articles.length === 1) {
    const { article, categoryName } = buildLabelMeta(articles[0], getCategoryName);
    return printStockArticleLabel(article, categoryName);
  }
  await downloadStockArticleLabels(articles, getCategoryName);
}
