/**
 * deliveryNotePdf.js — PDF Bon de livraison CRM format CITYMO (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';
import { clientDisplayName } from './clients';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const ICON_URL = 'https://i.ibb.co/S79nbLdm/icone.png';
const QR_URL = 'https://i.ibb.co/rRrG27n3/Capture-d-e-cran-2026-06-02-a-15-32-23.png';

const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const WHITE = [255, 255, 255];
const BORDER = [120, 120, 120];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 12;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_H = 26;
const MAX_Y = PAGE_H - FOOTER_H;
const BODY_TOP = M;
const BODY_BOTTOM = PAGE_H - FOOTER_H;

const CLIENT_W = 58;
const LOGO_MAX_W = 42;
const LOGO_MAX_H = 20;
const SIGN_BLOCK_H = 38;

const COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000',
  phone: 'Tél : +212 52 231 0043',
  email: 'contact@citymo.ma',
  legal: 'Capital de 200000 MAD RC: 401959',
  patente: 'Patente: 32173075',
  fiscal: 'IF: 25080805 - ICE: 002023116000060',
};

/** # / Désignation / Unité / Quantité / Remarque */
const COL_W = [8, 82, 22, 28, 46];
const COL_X = [M];
for (let i = 1; i < COL_W.length; i++) COL_X[i] = COL_X[i - 1] + COL_W[i - 1];
const COL_R = COL_W.map((w, i) => COL_X[i] + w - 2);

const TABLE_HDR_H = 8;
const PAD_TOP = 3.5;
const PAD_BOTTOM = 2.5;
const TITLE_LH = 3.4;

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
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtQty(n) {
  const v = Number(n);
  if (isNaN(v)) return '0';
  const fixed = Math.abs(v) % 1 === 0 ? String(Math.round(v)) : v.toFixed(2).replace('.', ',');
  return fixed;
}

function fmtUnite(u) {
  const map = { m2: 'm²', m3: 'm³', unite: 'unité' };
  return map[u] || u || 'unité';
}

function textRight(doc, text, rightX, y) {
  doc.text(String(text), rightX, y, { align: 'right' });
}

function textCenter(doc, text, centerX, y) {
  doc.text(String(text), centerX, y, { align: 'center' });
}

function drawCellBorder(doc, x, y, w, h) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);
}

function buildRows(bl) {
  const lignes = (bl.lignes || []).filter((l) => l.designation?.trim() || l.article_id);
  if (!lignes.length) return [{ kind: 'empty' }];
  return lignes.map((l, i) => ({
    kind: 'line',
    num: i + 1,
    designation: l.designation || '—',
    unite: fmtUnite(l.unite),
    quantite: Number(l.quantite_livree) > 0 ? l.quantite_livree : l.quantite_commandee,
    remarque: l.observation || l.remarque || '',
  }));
}

function measureLineHeight(doc, row) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const titleLines = doc.splitTextToSize(row.designation || '—', COL_W[1] - 4);
  let h = PAD_TOP + titleLines.length * TITLE_LH + PAD_BOTTOM;
  if (row.remarque) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const remLines = doc.splitTextToSize(row.remarque, COL_W[4] - 4);
    h = Math.max(h, PAD_TOP + remLines.length * 2.8 + PAD_BOTTOM);
  }
  return Math.max(h, 9);
}

export async function generateDeliveryNotePdf(bl) {
  const [logoMeta, iconMeta, qrMeta] = await Promise.all([
    loadImageWithSize(LOGO_URL),
    loadImageWithSize(ICON_URL),
    loadImageWithSize(QR_URL),
  ]);

  const client = bl.client || {};
  const clientNom = bl.client_nom || clientDisplayName(client) || 'CLIENT';
  const rows = buildRows(bl);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = M;

  const drawWatermark = () => {
    if (!iconMeta?.dataUrl) return;
    try {
      const maxW = PAGE_W - 16;
      const maxH = BODY_BOTTOM - BODY_TOP - 8;
      const size = containImage(iconMeta.width, iconMeta.height, maxW, maxH);
      const ix = PAGE_W / 2 - size.width / 2;
      const iy = (BODY_TOP + BODY_BOTTOM) / 2 - size.height / 2;
      if (doc.saveGraphicsState && doc.GState) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.07 }));
        doc.addImage(iconMeta.dataUrl, imgFmt(iconMeta.dataUrl), ix, iy, size.width, size.height);
        doc.restoreGraphicsState();
      }
    } catch { /* skip */ }
  };

  const drawFooter = (pageNum, totalPages) => {
    const lineY = PAGE_H - FOOTER_H + 4;
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.7);
    const qrSize = qrMeta
      ? containImage(qrMeta.width, qrMeta.height, 18, 18)
      : { width: 0, height: 0 };
    const lineEnd = qrMeta ? PAGE_W - M - qrSize.width - 2 : PAGE_W - M;
    doc.line(M, lineY, lineEnd, lineY);

    if (qrMeta?.dataUrl) {
      try {
        doc.addImage(
          qrMeta.dataUrl,
          imgFmt(qrMeta.dataUrl),
          PAGE_W - M - qrSize.width,
          lineY - qrSize.height + 1,
          qrSize.width,
          qrSize.height,
        );
      } catch { /* skip */ }
    }

    const pageText = `Page ${pageNum}/${totalPages}`;
    const boxW = 24;
    const boxH = 6;
    const boxX = PAGE_W / 2 - boxW / 2;
    const boxY = PAGE_H - 8;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.setFillColor(...WHITE);
    doc.rect(boxX, boxY - 4.5, boxW, boxH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(pageText, PAGE_W / 2, boxY - 0.5, { align: 'center' });
  };

  const drawTableHeader = (startY) => {
    doc.setFillColor(...RED);
    doc.rect(M, startY, CONTENT_W, TABLE_HDR_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    const mid = startY + TABLE_HDR_H / 2 + 1;
    doc.text('#', COL_X[0] + COL_W[0] / 2, mid, { align: 'center' });
    doc.text('DÉSIGNATION', COL_X[1] + 2, mid);
    textCenter(doc, 'UNITÉ', COL_X[2] + COL_W[2] / 2, mid);
    textRight(doc, 'QUANTITÉ', COL_R[3], mid);
    doc.text('REMARQUE', COL_X[4] + 2, mid);
    return startY + TABLE_HDR_H;
  };

  const drawLineRow = (row, startY) => {
    const h = measureLineHeight(doc, row);
    const midY = startY + h / 2 + 1;
    COL_W.forEach((w, i) => drawCellBorder(doc, COL_X[i], startY, w, h));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    doc.text(String(row.num), COL_X[0] + COL_W[0] / 2, midY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(row.designation || '—', COL_W[1] - 4);
    let ty = startY + PAD_TOP + 2.5;
    titleLines.forEach((line) => {
      doc.text(line, COL_X[1] + 2, ty);
      ty += TITLE_LH;
    });

    doc.setFont('helvetica', 'normal');
    textCenter(doc, row.unite, COL_X[2] + COL_W[2] / 2, midY);
    textRight(doc, fmtQty(row.quantite), COL_R[3], midY);

    if (row.remarque) {
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      const remLines = doc.splitTextToSize(row.remarque, COL_W[4] - 4);
      let ry = startY + PAD_TOP + 2;
      remLines.forEach((line) => {
        doc.text(line, COL_X[4] + 2, ry);
        ry += 2.8;
      });
    }

    return startY + h;
  };

  const drawEmptyRow = (startY) => {
    drawCellBorder(doc, M, startY, CONTENT_W, 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Aucune ligne', M + CONTENT_W / 2, startY + 7.5, { align: 'center' });
    return startY + 12;
  };

  const drawSignatureBlock = (startY) => {
    const colW = CONTENT_W / 3;
    const labels = ['Livré par', 'Reçu par', 'Cachet / Signature client'];
    labels.forEach((label, i) => {
      const x = M + i * colW;
      drawCellBorder(doc, x, startY, colW, SIGN_BLOCK_H);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...TEXT);
      doc.text(label, x + colW / 2, startY + 5, { align: 'center' });
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(x + 4, startY + SIGN_BLOCK_H - 8, x + colW - 4, startY + SIGN_BLOCK_H - 8);
    });
    if (bl.signature_client) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(bl.signature_client, M + 2 * colW + colW / 2, startY + SIGN_BLOCK_H - 10, { align: 'center' });
    }
    return startY + SIGN_BLOCK_H;
  };

  /* Header */
  const headerTop = M;
  if (logoMeta?.dataUrl) {
    const logoSize = containImage(logoMeta.width, logoMeta.height, LOGO_MAX_W, LOGO_MAX_H);
    try {
      doc.addImage(logoMeta.dataUrl, imgFmt(logoMeta.dataUrl), M, headerTop, logoSize.width, logoSize.height);
    } catch { /* skip */ }
  }

  const logoSize = logoMeta
    ? containImage(logoMeta.width, logoMeta.height, LOGO_MAX_W, LOGO_MAX_H)
    : { width: LOGO_MAX_W, height: 14 };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  let infoY = headerTop + logoSize.height + 2;
  [COMPANY.address, COMPANY.phone, COMPANY.email, COMPANY.legal, COMPANY.patente, COMPANY.fiscal].forEach((line) => {
    doc.text(line, M, infoY);
    infoY += 3;
  });

  const clientX = PAGE_W - M - CLIENT_W;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const nameLines = doc.splitTextToSize(clientNom.toUpperCase(), CLIENT_W - 4);
  const nameBoxH = Math.max(7, 3.5 + nameLines.length * 3.5);
  doc.setFillColor(...RED);
  doc.rect(clientX, headerTop, CLIENT_W, nameBoxH, 'F');
  doc.setTextColor(...WHITE);
  nameLines.forEach((line, i) => {
    doc.text(line, clientX + CLIENT_W - 2, headerTop + 3.5 + i * 3.5, { align: 'right' });
  });

  let clientY = headerTop + nameBoxH + 2.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT);

  const addr = bl.adresse_livraison || [client.adresse, client.ville].filter(Boolean).join(' ');
  if (addr) {
    const addrLines = doc.splitTextToSize(addr.toUpperCase(), CLIENT_W);
    addrLines.forEach((line) => {
      doc.text(line, clientX + CLIENT_W, clientY, { align: 'right' });
      clientY += 3;
    });
  }
  if (client.ice) {
    doc.text(`ICE : ${client.ice}`, clientX + CLIENT_W, clientY, { align: 'right' });
    clientY += 3;
  }

  y = Math.max(infoY, clientY) + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text('BON DE LIVRAISON', M, y);
  y += 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.9);
  doc.line(M, y, PAGE_W - M, y);
  y += 7;

  const infoFields = [
    ['N° BL', bl.numero || '—'],
    ['Date', fmtDate(bl.date_livraison)],
    ['Préparé par', (bl.prepare_par || bl.commercial || '—').toUpperCase()],
    ['Projet', (bl.projet || '—').toUpperCase()],
  ];
  if (bl.devis_reference || bl.devis_id) {
    infoFields.push(['Réf. devis', bl.devis_reference || String(bl.devis_id).slice(0, 8)]);
  }
  if (bl.facture_reference || bl.facture_id) {
    infoFields.push(['Réf. facture', bl.facture_reference || String(bl.facture_id).slice(0, 8)]);
  }

  doc.setFontSize(8);
  infoFields.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT);
    doc.text(`${label} :`, M, y);
    const valueLines = doc.splitTextToSize(String(value), CONTENT_W - 32);
    valueLines.forEach((line, i) => {
      doc.text(line, M + 30, y + i * 4);
    });
    y += Math.max(valueLines.length * 4, 5);
  });

  if (bl.remarques?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.text('Observations', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.splitTextToSize(bl.remarques.trim(), CONTENT_W).forEach((line) => {
      doc.text(line, M, y);
      y += 3.2;
    });
    y += 4;
  }

  let tableHeaderOnPage = false;
  const newPage = () => {
    doc.addPage();
    y = M + 4;
    tableHeaderOnPage = false;
  };

  const ensureSpace = (needed) => {
    if (y + needed > MAX_Y) newPage();
  };

  const ensureTableHeader = () => {
    if (!tableHeaderOnPage) {
      ensureSpace(TABLE_HDR_H);
      y = drawTableHeader(y);
      tableHeaderOnPage = true;
    }
  };

  if (rows.length === 1 && rows[0].kind === 'empty') {
    ensureTableHeader();
    ensureSpace(12);
    y = drawEmptyRow(y);
  } else {
    rows.forEach((row) => {
      ensureTableHeader();
      const h = measureLineHeight(doc, row);
      ensureSpace(h);
      y = drawLineRow(row, y);
    });
  }

  ensureSpace(SIGN_BLOCK_H + 4);
  y += 6;
  y = drawSignatureBlock(y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawWatermark();
    drawFooter(p, totalPages);
  }

  const safeName = (bl.numero || 'BL').replace(/[^\w-]+/g, '_');
  doc.save(`BL_${safeName}.pdf`);
}
