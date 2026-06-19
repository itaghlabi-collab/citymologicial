/**
 * mouvementPdf.js — PDF Bon de mouvement format CITYMO (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [90, 90, 90];
const BORDER = [190, 190, 190];
const GREY_BG = [248, 248, 248];
const HEADER_BG = [250, 250, 250];
const WHITE = [255, 255, 255];

const M = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_LIMIT = 275;

const COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000, Maroc',
  email: 'contact@citymo.ma',
  phone: 'Tél : 05 22 31 00 43',
  ice: 'ICE : 002023116000060',
};

// Logo source carré (~1:1) — containImage conserve le ratio (pas d'étirement)
const LOGO_MAX_W = 30;
const LOGO_MAX_H = 15;

async function loadImage(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
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

function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

async function loadImageWithSize(url) {
  const dataUrl = await loadImage(url);
  if (!dataUrl) return null;
  const size = await getImageSize(dataUrl);
  return { dataUrl, ...size };
}

function containImage(naturalW, naturalH, maxW, maxH) {
  if (!naturalW || !naturalH) return { width: maxW, height: maxH };
  const ratio = naturalW / naturalH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

function imgFmt(dataUrl) {
  if (!dataUrl?.includes('jpeg') && !dataUrl?.includes('jpg')) return 'PNG';
  return 'JPEG';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function drawBorderedBox(doc, x, y, w, h, fill = null) {
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(x, y, w, h, 'F');
  }
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.35);
  doc.rect(x, y, w, h);
}

function drawHeader(doc, bon, logoMeta) {
  const headerH = 48;
  const halfW = CONTENT_W / 2;
  const top = M;

  drawBorderedBox(doc, M, top, CONTENT_W, headerH);

  doc.setFillColor(...HEADER_BG);
  doc.rect(M, top, halfW, headerH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.35);
  doc.line(M + halfW, top, M + halfW, top + headerH);
  doc.rect(M, top, CONTENT_W, headerH);

  let ly = top + 8;
  if (logoMeta?.dataUrl) {
    const logoSize = containImage(logoMeta.width, logoMeta.height, LOGO_MAX_W, LOGO_MAX_H);
    try {
      doc.addImage(
        logoMeta.dataUrl,
        imgFmt(logoMeta.dataUrl),
        M + 6,
        top + 7,
        logoSize.width,
        logoSize.height,
      );
    } catch { /* skip */ }
    ly = top + 7 + logoSize.height + 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  [COMPANY.address, COMPANY.email, COMPANY.phone, COMPANY.ice].forEach((line) => {
    doc.text(line, M + 6, ly);
    ly += 4.8;
  });

  const rightX = M + halfW + 8;
  const rightW = halfW - 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...RED);
  doc.text('BON DE MOUVEMENT', rightX + rightW, top + 16, { align: 'right' });

  const metaLines = [
    ['Réf.', bon.ref || '—'],
    ['Date', fmtDate(bon.date_creation)],
    ['Statut', bon.statut || 'Brouillon'],
  ];

  let ry = top + 26;
  metaLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text(`${label} :`, rightX, ry);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), rightX + 22, ry);
    ry += 7;
  });

  return top + headerH + 8;
}

function drawMetaGrid(doc, bon, startY) {
  const boxH = 34;
  drawBorderedBox(doc, M, startY, CONTENT_W, boxH, GREY_BG);

  const colW = CONTENT_W / 3;
  const fields = [
    ['Type de mouvement', bon.type_mouvement || '—'],
    ['Emplacement source', bon.emplacement_source || '—'],
    ['Emplacement destination', bon.emplacement_destination || '—'],
    ['Créé par', bon.cree_par || '—'],
    ['Livreur', bon.livreur || '—'],
    ['Réceptionnaire', bon.receptionnaire || '—'],
  ];

  fields.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + 6 + col * colW;
    const y = startY + 10 + row * 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(String(value), colW - 8);
    doc.text(lines, x, y + 5);
  });

  return startY + boxH + 8;
}

function drawTextBlock(doc, label, value, startY) {
  if (!value?.trim()) return startY;
  const pad = 6;
  const lines = doc.splitTextToSize(value.trim(), CONTENT_W - pad * 2);
  const blockH = Math.max(20, 16 + lines.length * 5);

  drawBorderedBox(doc, M, startY, CONTENT_W, blockH, WHITE);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), M + pad, startY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT);
  doc.text(lines, M + pad, startY + 14);

  return startY + blockH + 6;
}

function drawArticlesTable(doc, bon, articles, startY) {
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text('Articles', M, y);
  y += 7;

  const cols = [14, 82, 22, 24, CONTENT_W - 142];
  const xs = [M];
  for (let i = 1; i < cols.length; i++) xs[i] = xs[i - 1] + cols[i - 1];
  const hdrH = 10;

  doc.setFillColor(...RED);
  doc.rect(M, y, CONTENT_W, hdrH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  const headers = ['#', 'Article', 'Qté', 'Unité', 'Notes'];
  headers.forEach((h, i) => {
    const align = i === 0 || i === 3 ? 'center' : 'left';
    const tx = i === 0 ? xs[i] + cols[i] / 2 : xs[i] + 3;
    doc.text(h, tx, y + 6.5, { align });
  });
  y += hdrH;

  const lignes = bon.lignes || [];
  if (!lignes.length) {
    drawBorderedBox(doc, M, y, CONTENT_W, 14, WHITE);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('Aucun article', M + CONTENT_W / 2, y + 9, { align: 'center' });
    return y + 14;
  }

  lignes.forEach((ligne, idx) => {
    const art = articles.find((a) => String(a.id) === String(ligne.article_id));
    const label = art
      ? `${art.code || art.reference} — ${art.designation || art.nom}`
      : (ligne.article_designation || ligne.article_code || '—');
    const unite = art?.unite || 'U';
    const notes = ligne.notes || '';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const desLines = doc.splitTextToSize(label, cols[1] - 6);
    const noteLines = notes ? doc.splitTextToSize(notes, cols[4] - 6) : [];
    const rowH = Math.max(12, Math.max(desLines.length, noteLines.length || 1) * 5 + 6);

    if (y + rowH > FOOTER_LIMIT) {
      doc.addPage();
      y = M;
    }

    cols.forEach((w, i) => drawBorderedBox(doc, xs[i], y, w, rowH, idx % 2 === 0 ? WHITE : GREY_BG));

    const midY = y + rowH / 2 + 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text(String(idx + 1), xs[0] + cols[0] / 2, midY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let ty = y + 6;
    desLines.forEach((line) => {
      doc.text(line, xs[1] + 3, ty);
      ty += 5;
    });

    doc.setFont('helvetica', 'bold');
    doc.text(String(ligne.quantite ?? ''), xs[2] + cols[2] / 2, midY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(unite, xs[3] + cols[3] / 2, midY, { align: 'center' });

    if (noteLines.length) {
      let ny = y + 6;
      noteLines.forEach((line) => {
        doc.text(line, xs[4] + 3, ny);
        ny += 5;
      });
    }

    y += rowH;
  });

  return y;
}

function drawFooter(doc, bon, startY) {
  let y = startY + 10;
  const totalLignes = (bon.lignes || []).length;
  const totalQte = (bon.lignes || []).reduce((s, l) => s + (Number(l.quantite) || 0), 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(`Lignes : ${totalLignes}  —  Quantité totale : ${totalQte}`, M, y);

  y += 16;
  const sigW = (CONTENT_W - 12) / 2;

  [['Signature livreur', M], ['Signature réceptionnaire', M + sigW + 12]].forEach(([label, x]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(label, x, y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(x, y + 16, x + sigW, y + 16);
  });
}

export async function generateMouvementPdf(bon, articles = []) {
  const logoMeta = await loadImageWithSize(LOGO_URL);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let y = drawHeader(doc, bon, logoMeta);
  y = drawMetaGrid(doc, bon, y);
  y = drawTextBlock(doc, 'Motif du mouvement', bon.motif, y);
  y = drawTextBlock(doc, 'Notes', bon.note, y);
  y = drawArticlesTable(doc, bon, articles, y);
  drawFooter(doc, bon, y);

  const filename = `bon-mouvement-${(bon.ref || 'draft').replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}
