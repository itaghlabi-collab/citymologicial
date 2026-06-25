/**
 * siteRequestPdf.js — PDF Bon de demande chantier CITYMO (A4, style Devis / BL)
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { setupPdfUnicodeFont, setPdfFont } from '../finance/pdfUnicode';
import { SITE_REQUEST_CATEGORIES, siteRequestStatutLabel } from '../../constants/siteMaterialRequests';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const ICON_URL = 'https://i.ibb.co/S79nbLdm/icone.png';

const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const WHITE = [255, 255, 255];
const BORDER = [180, 180, 180];
const HEADER_BG = [245, 245, 245];
const GREY_BG = [250, 250, 250];
const TABLE_HDR_BG = [235, 235, 235];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 10;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_H = 14;
const MAX_Y = PAGE_H - FOOTER_H;
const LOGO_MAX_W = 50;
const LOGO_MAX_H = 22;
const SIGN_H = 22;

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

function containImage(nw, nh, maxW, maxH) {
  if (!nw || !nh) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / nw, maxH / nh);
  return { width: nw * ratio, height: nh * ratio };
}

function imgFmt(dataUrl) {
  if (!dataUrl?.includes('jpeg') && !dataUrl?.includes('jpg')) return 'PNG';
  return 'JPEG';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fmtDateOnly(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function fmtTimeOnly(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function fmtQty(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '0';
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2).replace('.', ',');
}

function drawBorderedBox(doc, x, y, w, h, fill = null) {
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(x, y, w, h, 'F');
  }
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);
}

function drawRedAccent(doc, x, y, h) {
  doc.setFillColor(...RED);
  doc.rect(x, y, 1.2, h, 'F');
}

function drawHeader(doc, request, logoMeta) {
  const headerH = 44;
  const halfW = CONTENT_W / 2;
  const top = M;

  drawBorderedBox(doc, M, top, CONTENT_W, headerH);
  doc.setFillColor(...HEADER_BG);
  doc.rect(M, top, halfW, headerH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.line(M + halfW, top, M + halfW, top + headerH);
  doc.rect(M, top, CONTENT_W, headerH);

  let ly = top + 5;
  if (logoMeta?.dataUrl) {
    const logoSize = containImage(logoMeta.width, logoMeta.height, LOGO_MAX_W, LOGO_MAX_H);
    try {
      doc.addImage(
        logoMeta.dataUrl,
        imgFmt(logoMeta.dataUrl),
        M + 5,
        top + 5,
        logoSize.width,
        logoSize.height,
      );
    } catch { /* skip */ }
    ly = top + 5 + logoSize.height + 3;
  }

  setPdfFont(doc, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  [
    '228 Bd Mohammed V, Casablanca 20000',
    'Tél : +212 52 231 0043',
    'contact@citymo.ma',
    'ICE : 002023116000060',
  ].forEach((line) => {
    doc.text(line, M + 5, ly);
    ly += 3.2;
  });

  const rightX = M + halfW + 6;
  const rightW = halfW - 12;

  setPdfFont(doc, 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...RED);
  doc.text('BON DE DEMANDE CHANTIER', rightX + rightW, top + 14, { align: 'right' });

  const metaLines = [
    ['Référence', request.ref || '—'],
    ['Date demande', fmtDate(request.date_demande)],
    ['Date souhaitée', fmtDate(request.date_souhaitee)],
    ['Priorité', request.priorite || '—'],
    ['Statut', siteRequestStatutLabel(request.statut)],
  ];

  let ry = top + 22;
  metaLines.forEach(([label, value]) => {
    setPdfFont(doc, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${label} :`, rightX, ry);
    setPdfFont(doc, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    doc.text(String(value), rightX + 26, ry);
    ry += 4.5;
  });

  return top + headerH + 4;
}

function drawChantierMeta(doc, request, startY) {
  const boxH = 28;
  drawBorderedBox(doc, M, startY, CONTENT_W, boxH, GREY_BG);
  drawRedAccent(doc, M, startY, boxH);

  const colW = CONTENT_W / 2;
  const fields = [
    ['Projet', request.project_name || '—'],
    ['Réf. projet', request.project_ref || '—'],
    ['Client', request.client_name || '—'],
    ['Chef de projet', request.chef_projet || '—'],
    ['Chef de chantier', request.chef_chantier || '—'],
    ['Magasinier', request.prepared_by_name || '—'],
    ['Validation DG', request.validated_dg_name || (request.requires_dg ? 'En attente' : '—')],
    ['Bon de sortie', request.movement_ref || '—'],
  ];

  fields.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + 5 + col * colW;
    const y = startY + 6 + row * 6.5;

    setPdfFont(doc, 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);

    setPdfFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(String(value), colW - 10);
    doc.text(lines[0], x, y + 3.5);
  });

  return startY + boxH + 4;
}

/** Colonnes : Désignation | Demandée | Préparée | Livrée | Stock | Observations */
const COL_W = [52, 18, 18, 18, 20, CONTENT_W - 126];
const COL_X = [M];
for (let i = 1; i < COL_W.length; i++) COL_X[i] = COL_X[i - 1] + COL_W[i - 1];

function drawTableHeader(doc, y) {
  const hdrH = 7;
  doc.setFillColor(...TABLE_HDR_BG);
  doc.rect(M, y, CONTENT_W, hdrH, 'F');
  drawRedAccent(doc, M, y, hdrH);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.rect(M, y, CONTENT_W, hdrH);

  setPdfFont(doc, 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...TEXT);
  const mid = y + 4.8;
  const headers = ['DÉSIGNATION', 'QTÉ DEM.', 'QTÉ PRÉP.', 'QTÉ LIV.', 'STOCK', 'OBSERVATIONS'];
  headers.forEach((h, i) => {
    const tx = i === 0 ? COL_X[i] + 3 : COL_X[i] + COL_W[i] / 2;
    const align = i === 0 ? 'left' : 'center';
    doc.text(h, tx, mid, { align });
  });
  return y + hdrH;
}

function measureLineRow(doc, line) {
  setPdfFont(doc, 'normal');
  doc.setFontSize(7);
  const nameLines = doc.splitTextToSize(line.article_name || '—', COL_W[0] - 5);
  const obs = line.remarque_magasinier || line.remarque || '';
  const obsLines = obs ? doc.splitTextToSize(obs, COL_W[5] - 4) : [''];
  return Math.max(nameLines.length * 3.2, obsLines.length * 3, 5.5) + 2;
}

function drawLineRow(doc, line, y) {
  const rowH = measureLineRow(doc, line);
  COL_W.forEach((w, i) => drawBorderedBox(doc, COL_X[i], y, w, rowH, i % 2 === 0 ? WHITE : GREY_BG));

  const midY = y + rowH / 2 + 1;
  setPdfFont(doc, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT);

  const nameLines = doc.splitTextToSize(line.article_name || '—', COL_W[0] - 5);
  let ty = y + 3.5;
  nameLines.forEach((ln) => {
    doc.text(ln, COL_X[0] + 3, ty);
    ty += 3.2;
  });

  [line.quantite_demandee, line.quantite_preparee, line.quantite_livree].forEach((q, i) => {
    doc.text(fmtQty(q), COL_X[i + 1] + COL_W[i + 1] / 2, midY, { align: 'center' });
  });

  const stock = line.stock_actuel ?? line.disponible_apres;
  doc.text(stock != null ? fmtQty(stock) : '—', COL_X[4] + COL_W[4] / 2, midY, { align: 'center' });

  const obs = line.remarque_magasinier || line.remarque || '';
  if (obs) {
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    const obsLines = doc.splitTextToSize(obs, COL_W[5] - 4);
    let oy = y + 3;
    obsLines.forEach((ln) => {
      doc.text(ln, COL_X[5] + 2, oy);
      oy += 2.8;
    });
  }

  return y + rowH;
}

function drawCategorySection(doc, catLabel, lines, y, ensureSpace) {
  const catHdrH = 6;
  if (ensureSpace(catHdrH + 10)) y = M;

  doc.setFillColor(...HEADER_BG);
  doc.rect(M, y, CONTENT_W, catHdrH, 'F');
  drawRedAccent(doc, M, y, catHdrH);
  setPdfFont(doc, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RED);
  doc.text(catLabel, M + 4, y + 4.2);
  y += catHdrH;

  if (ensureSpace(8)) y = M;
  y = drawTableHeader(doc, y);

  lines.forEach((line) => {
    const rowH = measureLineRow(doc, line);
    if (ensureSpace(rowH)) y = M;
    y = drawLineRow(doc, line, y);
  });

  return y + 2;
}

function drawTextBlock(doc, label, value, startY, ensureSpace) {
  const pad = 4;
  const text = (value || '').trim() || '—';
  const lines = doc.splitTextToSize(text, CONTENT_W - pad * 2);
  const blockH = Math.max(14, 10 + lines.length * 3.5);

  if (ensureSpace(blockH + 2)) return M;
  drawBorderedBox(doc, M, startY, CONTENT_W, blockH, WHITE);
  drawRedAccent(doc, M, startY, blockH);

  setPdfFont(doc, 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), M + pad + 2, startY + 5);

  setPdfFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT);
  doc.text(lines, M + pad + 2, startY + 10);

  return startY + blockH + 3;
}

function drawHistoryTable(doc, history, startY, ensureSpace) {
  const hdrH = 7;
  const histCols = [22, 14, 38, CONTENT_W - 74];
  const histX = [M];
  for (let i = 1; i < histCols.length; i++) histX[i] = histX[i - 1] + histCols[i - 1];

  if (ensureSpace(hdrH + 12)) startY = M;

  setPdfFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT);
  doc.text('Historique des validations', M, startY);
  startY += 5;

  doc.setFillColor(...TABLE_HDR_BG);
  doc.rect(M, startY, CONTENT_W, hdrH, 'F');
  drawRedAccent(doc, M, startY, hdrH);
  doc.setDrawColor(...BORDER);
  doc.rect(M, startY, CONTENT_W, hdrH);

  setPdfFont(doc, 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...TEXT);
  const mid = startY + 4.8;
  ['DATE', 'HEURE', 'UTILISATEUR', 'ACTION RÉALISÉE'].forEach((h, i) => {
    doc.text(h, histX[i] + (i < 2 ? histCols[i] / 2 : 2), mid, { align: i < 2 ? 'center' : 'left' });
  });
  startY += hdrH;

  const rows = history?.length ? history : [{ action: '—', actor_name: '—', created_at: null }];

  rows.forEach((h, idx) => {
    const actionLines = doc.splitTextToSize(h.action || '—', histCols[3] - 4);
    const rowH = Math.max(6, actionLines.length * 3 + 2);
    if (ensureSpace(rowH)) startY = M;

    histCols.forEach((w, i) => drawBorderedBox(doc, histX[i], startY, w, rowH, idx % 2 === 0 ? WHITE : GREY_BG));

    const ry = startY + rowH / 2 + 1;
    setPdfFont(doc, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT);
    doc.text(fmtDateOnly(h.created_at), histX[0] + histCols[0] / 2, ry, { align: 'center' });
    doc.text(fmtTimeOnly(h.created_at), histX[1] + histCols[1] / 2, ry, { align: 'center' });
    doc.text(h.actor_name || 'Système', histX[2] + 2, ry);
    let ay = startY + 3.5;
    actionLines.forEach((ln) => {
      doc.text(ln, histX[3] + 2, ay);
      ay += 3;
    });
    startY += rowH;
  });

  return startY + 3;
}

function drawSignatures(doc, startY, iconMeta, ensureSpace) {
  const needed = SIGN_H + 4;
  if (ensureSpace(needed)) startY = M;

  const labels = ['Chef de chantier', 'Chef de projet', 'Magasinier', 'Validation DG', 'Cachet CITYMO'];
  const gap = 2;
  const sigW = (CONTENT_W - gap * (labels.length - 1)) / labels.length;

  labels.forEach((label, i) => {
    const x = M + i * (sigW + gap);
    drawBorderedBox(doc, x, startY, sigW, SIGN_H, WHITE);
    setPdfFont(doc, 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + sigW / 2, startY + 4, { align: 'center' });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(x + 2, startY + SIGN_H - 5, x + sigW - 2, startY + SIGN_H - 5);

    if (label === 'Cachet CITYMO' && iconMeta?.dataUrl) {
      try {
        const sz = containImage(iconMeta.width, iconMeta.height, sigW - 6, SIGN_H - 10);
        doc.addImage(
          iconMeta.dataUrl,
          imgFmt(iconMeta.dataUrl),
          x + (sigW - sz.width) / 2,
          startY + 6,
          sz.width,
          sz.height,
        );
      } catch { /* skip */ }
    }
  });

  return startY + SIGN_H + 3;
}

function drawFooter(doc, pageNum, totalPages) {
  const y = PAGE_H - FOOTER_H + 4;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(M, y, PAGE_W - M, y);
  setPdfFont(doc, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text('CITYMO — Document officiel de demande / sortie matériel chantier', M, y + 5);
  doc.text(`Page ${pageNum}/${totalPages}`, PAGE_W - M, y + 5, { align: 'right' });
}

export async function generateSiteRequestPdf(request) {
  const [logoRaw, iconMeta] = await Promise.all([
    loadCompanyLogoFit(LOGO_MAX_W, LOGO_MAX_H).then((l) => l || loadImageWithSize(LOGO_URL)),
    loadImageWithSize(ICON_URL),
  ]);
  const logoMeta = logoRaw ? {
    dataUrl: logoRaw.dataUrl,
    width: logoRaw.width || logoRaw.w,
    height: logoRaw.height || logoRaw.h,
  } : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await setupPdfUnicodeFont(doc);

  let pageNum = 1;
  const ensureSpace = (needed) => {
    if (y + needed > MAX_Y) {
      doc.addPage();
      pageNum += 1;
      y = M;
      return true;
    }
    return false;
  };

  let y = drawHeader(doc, request, logoMeta);
  y = drawChantierMeta(doc, request, y);

  const activeLines = (request.lines || []).filter((l) => Number(l.quantite_demandee) > 0);

  SITE_REQUEST_CATEGORIES.forEach((cat) => {
    const catLines = activeLines.filter((l) => l.category_id === cat.id);
    if (!catLines.length) return;
    y = drawCategorySection(doc, cat.label, catLines, y, ensureSpace);
  });

  y = drawTextBlock(doc, 'Observations générales', request.observation, y, ensureSpace);
  y = drawHistoryTable(doc, request.history, y, ensureSpace);
  y = drawSignatures(doc, y, iconMeta, ensureSpace);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  doc.save(`demande-chantier-${(request.ref || 'DC').replace(/\s/g, '-')}.pdf`);
}
