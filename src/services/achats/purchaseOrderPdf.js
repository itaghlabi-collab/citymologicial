/**
 * purchaseOrderPdf.js — PDF Bon de commande format CITYMO (A4, jsPDF, aligné facture/devis CRM)
 */
import { jsPDF } from 'jspdf';
import {
  addCrmPdfImage,
  CRM_PDF_IMAGE_ALIAS,
  loadCrmPdfImages,
} from '../../utils/crm/crmPdfImageUtils';
import { sanitizeBCLignes } from './purchaseOrders';
import { moneyLineHt, moneyToNumber, moneyFormatUnitPrice } from '../../utils/decimalMoney';

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
const BODY_TOP = M;
const BODY_BOTTOM = PAGE_H - FOOTER_H;

const FOOTER_LINE_Y = PAGE_H - FOOTER_H + 4;
const FOOTER_QR_MAX = 18;
const FOOTER_QR_GAP = 6;

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

function getFooterQrLayout(qrMeta) {
  const qrSize = qrMeta
    ? containImage(qrMeta.width, qrMeta.height, FOOTER_QR_MAX, FOOTER_QR_MAX)
    : { width: 0, height: 0 };
  const qrX = PAGE_W - M - qrSize.width;
  const qrY = FOOTER_LINE_Y - qrSize.height;
  const lineEndX = qrMeta?.dataUrl ? qrX - FOOTER_QR_GAP : PAGE_W - M;
  const contentMaxY = qrMeta?.dataUrl ? qrY - 2 : PAGE_H - FOOTER_H;
  return { qrSize, qrX, qrY, lineEndX, contentMaxY };
}

const SUPPLIER_W = 58;
const LOGO_MAX_W = 42;
const LOGO_MAX_H = 20;

const COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000',
  phone: 'Tél : +212 52 231 0043',
  email: 'contact@citymo.ma',
  legal: 'Capital de 2 000 000 MAD RC: 401959',
  patente: 'Patente: 32173075',
  fiscal: 'IF: 25080805 - ICE: 002023116000060',
};

const COL_W = [8, 80, 18, 22, 28, 30];
const COL_X = [M];
for (let i = 1; i < COL_W.length; i++) COL_X[i] = COL_X[i - 1] + COL_W[i - 1];

const TABLE_HDR_H = 8;
const PAD_TOP = 3.5;
const PAD_BOTTOM = 2.5;
const TITLE_LH = 3.4;
const DESC_LH = 2.8;

const COL_R = COL_W.map((w, i) => COL_X[i] + w - 2);
const TOTAL_ROW_H = 7;

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtNum(n) {
  const v = Number(n);
  if (isNaN(v)) return '0,00';
  const fixed = Math.abs(v).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const sign = v < 0 ? '-' : '';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped},${decPart}`;
}

function textRight(doc, text, rightX, y) {
  doc.text(String(text), rightX, y, { align: 'right' });
}

function textCenter(doc, text, centerX, y) {
  doc.text(String(text), centerX, y, { align: 'center' });
}

function fmtUnite(u) {
  const map = { m2: 'm²', m3: 'm³', unite: 'unité' };
  return map[u] || u || 'unité';
}

function supplierDisplayName(bc, supplier) {
  return (
    bc.fournisseur
    || bc.supplier_name
    || supplier?.raison_sociale
    || supplier?.company_name
    || 'FOURNISSEUR'
  );
}

function getBcTvaPercent(bc) {
  const ht = Number(bc?.subtotal_ht) || 0;
  const tva = Number(bc?.total_vat) || 0;
  if (ht <= 0) return 20;
  return Math.round((tva / ht) * 100);
}

function buildPdfRows(bc) {
  const lignes = sanitizeBCLignes(bc.lignes || bc.lines || []);
  const hasArticles = lignes.some((l) => (l.type || 'article') === 'article');
  if (!hasArticles) return [{ kind: 'empty' }];

  const rows = [];
  let num = 0;

  lignes.forEach((l) => {
    if (l.type === 'titre') {
      rows.push({ kind: 'titre', text: l.designation || '' });
      return;
    }
    if (l.type === 'sous_titre') {
      rows.push({ kind: 'sous_titre', text: l.designation || '' });
      return;
    }
    if ((l.type || 'article') !== 'article') return;

    num += 1;
    const lineHt = moneyLineHt({ qty: l.qte, unitPriceHt: l.prix_ht, remisePct: l.remise });
    rows.push({
      kind: 'article',
      num,
      designation: l.designation || '—',
      description: l.description || '',
      unite: fmtUnite(l.unite),
      quantite: l.qte,
      prix_ht: l.prix_ht,
      total_ht: moneyToNumber(lineHt),
    });
  });

  return rows;
}

function getDesigLines(doc, row) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const titleLines = doc.splitTextToSize(row.designation || '—', COL_W[1] - 4);
  const descLines = row.description
    ? (doc.setFont('helvetica', 'normal'), doc.setFontSize(6.5), doc.splitTextToSize(row.description, COL_W[1] - 4))
    : [];
  return { titleLines, descLines };
}

function measureArticleHeight(doc, row) {
  const { titleLines, descLines } = getDesigLines(doc, row);
  let h = PAD_TOP + titleLines.length * TITLE_LH;
  if (descLines.length) h += 1 + descLines.length * DESC_LH;
  h += PAD_BOTTOM;
  return Math.max(h, 9);
}

function getLabelRowLayout(doc, text, options = {}) {
  const {
    fontSize = 7.5,
    uppercase = false,
    bold = true,
    italic = false,
    indent = 0,
    minH = 8,
  } = options;
  const displayText = uppercase ? String(text || '').toUpperCase() : String(text || '');
  doc.setFont('helvetica', italic ? 'italic' : (bold ? 'bold' : 'normal'));
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(displayText, COL_W[1] - 4 - indent);
  const lineH = fontSize >= 9 ? 3.8 : fontSize >= 8 ? 3.5 : italic ? 3.2 : 3.4;
  const h = Math.max(PAD_TOP + lines.length * lineH + PAD_BOTTOM, minH);
  return { lines, h, lineH, fontSize, bold, italic, indent };
}

function measureLabelRowHeight(doc, text, options = {}) {
  return getLabelRowLayout(doc, text, options).h;
}

function drawTableLabelRow(doc, text, startY, options = {}) {
  const { lines, h, lineH, fontSize, bold, italic, indent } = getLabelRowLayout(doc, text, options);

  drawCellBorder(doc, M, startY, CONTENT_W, h);

  doc.setFont('helvetica', italic ? 'italic' : (bold ? 'bold' : 'normal'));
  doc.setFontSize(fontSize);
  doc.setTextColor(...(italic ? MUTED : TEXT));

  let ty = startY + PAD_TOP + 2;
  lines.forEach((line) => {
    doc.text(line, COL_X[1] + 2 + indent, ty);
    ty += lineH;
  });

  return startY + h;
}

function measureRowHeight(doc, row) {
  if (row.kind === 'empty') return 12;
  if (row.kind === 'titre') return measureLabelRowHeight(doc, row.text, { fontSize: 9, uppercase: true, minH: 8 });
  if (row.kind === 'sous_titre') return measureLabelRowHeight(doc, row.text, { fontSize: 8, indent: 2, minH: 7 });
  return measureArticleHeight(doc, row);
}

function drawCellBorder(doc, x, y, w, h) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);
}

function deliverPdf(doc, filename, options = {}) {
  if (!options.openInNewTab) {
    doc.save(filename);
    return;
  }
  const url = URL.createObjectURL(doc.output('blob'));
  const target = options.popupWindow;
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function generatePurchaseOrderPdf(bc, supplier = null, options = {}) {
  const { logoMeta, iconMeta, qrMeta, signatureMeta } = await loadCrmPdfImages({ withSignature: true });

  const supplierNom = supplierDisplayName(bc, supplier);
  const devise = bc.devise || bc.currency || 'MAD';
  const rows = buildPdfRows(bc);
  const footerLayout = getFooterQrLayout(qrMeta);
  const tvaPct = getBcTvaPercent(bc);
  const noteText = bc.note?.trim() || '';

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
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
        addCrmPdfImage(doc, iconMeta, ix, iy, size.width, size.height, CRM_PDF_IMAGE_ALIAS.icon);
        doc.restoreGraphicsState();
      }
    } catch { /* skip */ }
  };

  const drawFooter = (pageNum, totalPages) => {
    const { qrSize, qrX, qrY, lineEndX } = footerLayout;

    if (qrMeta?.dataUrl) {
      doc.setFillColor(...WHITE);
      doc.rect(lineEndX, qrY - 1, PAGE_W - M - lineEndX, PAGE_H - qrY + 1, 'F');
    }

    doc.setDrawColor(...RED);
    doc.setLineWidth(0.7);
    doc.line(M, FOOTER_LINE_Y, lineEndX, FOOTER_LINE_Y);

    if (qrMeta?.dataUrl) {
      try {
        addCrmPdfImage(doc, qrMeta, qrX, qrY, qrSize.width, qrSize.height, CRM_PDF_IMAGE_ALIAS.qr);
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
    textRight(doc, 'PU HT', COL_R[4], mid);
    textRight(doc, 'TOTAL HT', COL_R[5], mid);
    return startY + TABLE_HDR_H;
  };

  const drawEmptyRow = (startY) => {
    drawCellBorder(doc, M, startY, CONTENT_W, 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Aucune ligne', M + CONTENT_W / 2, startY + 7.5, { align: 'center' });
    return startY + 12;
  };

  const drawArticleRow = (row, startY) => {
    const h = measureArticleHeight(doc, row);
    const { titleLines, descLines } = getDesigLines(doc, row);
    const midY = startY + h / 2 + 1;

    COL_W.forEach((w, i) => drawCellBorder(doc, COL_X[i], startY, w, h));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    doc.text(String(row.num), COL_X[0] + COL_W[0] / 2, midY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    let ty = startY + PAD_TOP + 2.5;
    titleLines.forEach((line) => {
      doc.text(line, COL_X[1] + 2, ty);
      ty += TITLE_LH;
    });

    if (descLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      ty += 0.5;
      descLines.forEach((line) => {
        doc.text(line, COL_X[1] + 2, ty);
        ty += DESC_LH;
      });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    textCenter(doc, row.unite, COL_X[2] + COL_W[2] / 2, midY);
    textRight(doc, fmtNum(row.quantite), COL_R[3], midY);
    textRight(doc, moneyFormatUnitPrice(row.prix_ht).replace(' MAD', ''), COL_R[4], midY);
    doc.setFont('helvetica', 'bold');
    textRight(doc, `${fmtNum(row.total_ht)} ${devise}`, COL_R[5], midY);

    return startY + h;
  };

  const drawTotalsBlock = (startY) => {
    const items = [
      { label: 'Total HT :', value: bc.subtotal_ht, bold: false, fs: 8, red: false },
      { label: `TVA (${tvaPct}%) :`, value: bc.total_vat, bold: false, fs: 8, red: false },
      { label: 'Total TTC :', value: bc.total_ttc, bold: true, fs: 9, red: true, ttc: true },
    ];

    const blockH = TOTAL_ROW_H * items.length;
    const splitX = M + CONTENT_W / 2;
    const leftW = CONTENT_W / 2;
    const rightW = CONTENT_W / 2;

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(M, startY, CONTENT_W, blockH);
    doc.line(splitX, startY, splitX, startY + blockH);

    if (signatureMeta?.dataUrl) {
      const pad = 3;
      const sigSize = containImage(
        signatureMeta.width,
        signatureMeta.height,
        leftW - pad * 2,
        blockH - pad * 2,
      );
      const sigX = M + (leftW - sigSize.width) / 2;
      const sigY = startY + (blockH - sigSize.height) / 2;
      try {
        addCrmPdfImage(
          doc,
          signatureMeta,
          sigX,
          sigY,
          sigSize.width,
          sigSize.height,
          CRM_PDF_IMAGE_ALIAS.signature,
        );
      } catch { /* skip */ }
    }

    items.forEach((item, i) => {
      const cy = startY + i * TOTAL_ROW_H;
      if (item.ttc) {
        doc.setFillColor(245, 245, 245);
        doc.rect(splitX, cy, rightW, TOTAL_ROW_H, 'F');
        doc.setDrawColor(...BORDER);
        doc.line(splitX, cy, splitX + rightW, cy);
      } else if (i > 0) {
        doc.setDrawColor(...BORDER);
        doc.line(splitX, cy, splitX + rightW, cy);
      }
      const mid = cy + TOTAL_ROW_H / 2 + 1;
      doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
      doc.setFontSize(item.fs);
      doc.setTextColor(...(item.red ? RED : TEXT));
      doc.text(item.label, splitX + 3, mid);
      textRight(doc, `${fmtNum(item.value)} ${devise}`, splitX + rightW - 3, mid);
    });

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(M, startY, CONTENT_W, blockH);

    return startY + blockH;
  };

  const headerTop = M;

  if (logoMeta?.dataUrl) {
    const logoSize = containImage(logoMeta.width, logoMeta.height, LOGO_MAX_W, LOGO_MAX_H);
    try {
      addCrmPdfImage(doc, logoMeta, M, headerTop, logoSize.width, logoSize.height, CRM_PDF_IMAGE_ALIAS.logo);
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

  const supplierX = PAGE_W - M - SUPPLIER_W;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const nameLines = doc.splitTextToSize(supplierNom.toUpperCase(), SUPPLIER_W - 4);
  const nameBoxH = Math.max(7, 3.5 + nameLines.length * 3.5);
  doc.setFillColor(...RED);
  doc.rect(supplierX, headerTop, SUPPLIER_W, nameBoxH, 'F');
  doc.setTextColor(...WHITE);
  nameLines.forEach((line, i) => {
    doc.text(line, supplierX + SUPPLIER_W - 2, headerTop + 3.5 + i * 3.5, { align: 'right' });
  });

  let supplierY = headerTop + nameBoxH + 2.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT);

  const addrParts = [
    supplier?.adresse || supplier?.address,
    supplier?.ville || supplier?.city,
  ].filter(Boolean);
  if (addrParts.length) {
    const addrLines = doc.splitTextToSize(addrParts.join(' ').toUpperCase(), SUPPLIER_W);
    addrLines.forEach((line) => {
      doc.text(line, supplierX + SUPPLIER_W, supplierY, { align: 'right' });
      supplierY += 3;
    });
  }
  const ice = supplier?.ice;
  if (ice) {
    doc.text(`ICE : ${ice}`, supplierX + SUPPLIER_W, supplierY, { align: 'right' });
    supplierY += 3;
  }

  y = Math.max(infoY, supplierY) + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  const ref = bc.ref || bc.ref_bc || '';
  doc.text(`BON DE COMMANDE ${ref}`.trim(), M, y);
  y += 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.9);
  doc.line(M, y, PAGE_W - M, y);
  y += 7;

  const infoFields = [
    ['Date commande', fmtDate(bc.date || bc.order_date)],
    ['Date livraison prévue', fmtDate(bc.date_livraison || bc.delivery_date)],
    ['Devise', (devise || 'MAD').toUpperCase()],
    ['Statut', (bc.statut || bc.status || '—').toUpperCase()],
  ];

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

  if (noteText) {
    doc.setFont('helvetica', 'bold');
    doc.text('Observations', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(noteText, CONTENT_W);
    noteLines.forEach((line) => {
      doc.text(line, M, y);
      y += 3.2;
    });
    y += 5;
  } else {
    y += 3;
  }

  let tableHeaderOnPage = false;

  const newPage = () => {
    doc.addPage();
    y = M + 4;
    tableHeaderOnPage = false;
  };

  const ensureSpace = (needed) => {
    if (y + needed > footerLayout.contentMaxY) newPage();
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
      const h = measureRowHeight(doc, row);
      const headerH = tableHeaderOnPage ? 0 : TABLE_HDR_H;
      ensureSpace(headerH + h);
      ensureTableHeader();
      if (row.kind === 'titre') {
        y = drawTableLabelRow(doc, row.text, y, { fontSize: 9, uppercase: true, minH: 8 });
      } else if (row.kind === 'sous_titre') {
        y = drawTableLabelRow(doc, row.text, y, { fontSize: 8, indent: 2, minH: 7 });
      } else if (row.kind === 'article') {
        y = drawArticleRow(row, y);
      }
    });
  }

  ensureSpace(TOTAL_ROW_H * 3);
  y = drawTotalsBlock(y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawWatermark();
    drawFooter(p, totalPages);
  }

  const safeRef = (ref || 'BC').replace(/\s+/g, '_');
  deliverPdf(doc, `Bon_Commande_${safeRef}.pdf`, options);
}
