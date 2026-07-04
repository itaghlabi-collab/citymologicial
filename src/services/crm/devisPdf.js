/**
 * devisPdf.js — PDF Devis CRM format CITYMO (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';
import { clientDisplayName } from './clients';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const ICON_URL = 'https://i.ibb.co/S79nbLdm/icone.png';
const QR_URL = 'https://i.ibb.co/rRrG27n3/Capture-d-e-cran-2026-06-02-a-15-32-23.png';
const SIGNATURE_URL = 'https://i.ibb.co/nMVcsDqS/signature.png';

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

/** Footer devis — ligne rouge + QR (référence CITYMO) */
const FOOTER_LINE_Y = PAGE_H - FOOTER_H + 4;
const FOOTER_QR_MAX = 18;
const FOOTER_QR_GAP = 6;

function getFooterQrLayout(qrMeta) {
  const qrSize = qrMeta
    ? containImage(qrMeta.width, qrMeta.height, FOOTER_QR_MAX, FOOTER_QR_MAX)
    : { width: 0, height: 0 };
  const qrX = PAGE_W - M - qrSize.width;
  const qrY = FOOTER_LINE_Y - qrSize.height;
  const lineEndX = qrMeta?.dataUrl ? qrX - FOOTER_QR_GAP : PAGE_W - M;
  const contentMaxY = qrMeta?.dataUrl ? qrY - 2 : MAX_Y;
  return { qrSize, qrX, qrY, lineEndX, contentMaxY };
}

const CLIENT_W = 58;
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

const DEFAULT_CONDITIONS =
  '• Les prix sont exprimés en MAD • Paiement selon les modalités convenues au contrat. • Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.';

/** Colonnes tableau (mm) — total = CONTENT_W */
const COL_W = [8, 80, 18, 22, 28, 30];
const COL_X = [M];
for (let i = 1; i < COL_W.length; i++) COL_X[i] = COL_X[i - 1] + COL_W[i - 1];

const TABLE_HDR_H = 8;
const CAT_ROW_H = 7;
const PAD_TOP = 3.5;
const PAD_BOTTOM = 2.5;
const TITLE_LH = 3.4;
const DESC_LH = 2.8;

const COL_R = COL_W.map((w, i) => COL_X[i] + w - 2);
const VALUE_COL_R = COL_R[5];
const LABEL_COL_R = COL_R[4];
const LEFT_MERGE_W = CONTENT_W - COL_W[5];
const TOTAL_ROW_H = 7;

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

function isDevisApproved(devis) {
  const s = String(devis?.statut || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return s === 'valide' || s === 'approuve';
}

function getDevisTvaPercent(devis) {
  const ht = Number(devis?.total_ht) || 0;
  const tva = Number(devis?.total_tva) || 0;
  if (ht <= 0) return 20;
  return Math.round((tva / ht) * 100);
}

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

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];

function underHundred(n) {
  if (n < 17) return FR_UNITS[n];
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][ten];
    if (unit === 0) return tens;
    if (unit === 1) return `${tens} et un`;
    return `${tens}-${underHundred(unit)}`;
  }
  if (n < 80) return `soixante-${underHundred(n - 60)}`;
  const unit = n - 80;
  if (unit === 0) return 'quatre-vingts';
  return `quatre-vingt-${underHundred(unit)}`;
}

function underThousand(n) {
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = h === 1 ? 'cent' : `${underHundred(h)} cent`;
  if (r === 0 && h > 1) s += 's';
  else if (r > 0) s += ` ${underHundred(r)}`;
  return s;
}

function integerToFrench(n) {
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (millions > 0) parts.push(millions === 1 ? 'un million' : `${integerToFrench(millions)} millions`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${underThousand(thousands)} mille`);
  if (rest > 0 || parts.length === 0) parts.push(underThousand(rest));
  return parts.join(' ');
}

function amountToFrenchWords(amount) {
  const centsTotal = Math.round((Number(amount) || 0) * 100);
  const dirhams = Math.floor(centsTotal / 100);
  const centimes = centsTotal % 100;
  let text = `${integerToFrench(dirhams)} dirham${dirhams > 1 ? 's' : ''}`;
  if (centimes > 0) {
    text += ` et ${integerToFrench(centimes)} centime${centimes > 1 ? 's' : ''}`;
  }
  return text;
}

function buildArreteText(totalTtc) {
  return `Arrêté le présent devis à la somme de ${amountToFrenchWords(totalTtc)} TTC.`;
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

function buildPdfRows(devis, catMap) {
  const lignes = devis.lignes || [];
  const hasArticles = lignes.some((l) => l.type === 'article');
  if (!hasArticles) return [{ kind: 'empty' }];

  const rows = [];
  let currentCat = null;
  let num = 0;

  lignes.forEach((l) => {
    if (l.type === 'titre') {
      rows.push({ kind: 'titre', text: l.designation || '' });
      currentCat = null;
      return;
    }
    if (l.type === 'sous_titre') {
      rows.push({ kind: 'sous_titre', text: l.designation || '' });
      return;
    }
    if (l.type === 'note') {
      rows.push({ kind: 'note', text: l.designation || '' });
      return;
    }
    if (l.type !== 'article') return;

    const catKey = l.categorie_id ? String(l.categorie_id) : '__none__';
    if (catKey !== currentCat) {
      currentCat = catKey;
      if (catKey !== '__none__') {
        rows.push({
          kind: 'section',
          text: formatCategoryDisplayName(catMap[catKey] || 'SANS CATÉGORIE'),
        });
      }
    }

    num += 1;
    const ht = Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise || 0) / 100);
    rows.push({
      kind: 'article',
      num,
      designation: l.designation || '—',
      description: l.description || '',
      unite: fmtUnite(l.unite),
      quantite: l.quantite,
      prix_ht: l.prix_ht,
      total_ht: ht,
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
    minH = CAT_ROW_H,
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
  if (row.kind === 'section') return measureLabelRowHeight(doc, row.text, { uppercase: true });
  if (row.kind === 'titre') return measureLabelRowHeight(doc, row.text, { fontSize: 9, uppercase: true, minH: 8 });
  if (row.kind === 'sous_titre') return measureLabelRowHeight(doc, row.text, { fontSize: 8, indent: 2, minH: 7 });
  if (row.kind === 'note') return measureLabelRowHeight(doc, row.text, { fontSize: 7, bold: false, italic: true });
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

export async function generateDevisPdf(devis, catMap = {}, options = {}) {
  const showSignature = isDevisApproved(devis);
  const [logoMeta, iconMeta, qrMeta, signatureMeta] = await Promise.all([
    loadImageWithSize(LOGO_URL),
    loadImageWithSize(ICON_URL),
    loadImageWithSize(QR_URL),
    showSignature ? loadImageWithSize(SIGNATURE_URL) : Promise.resolve(null),
  ]);

  const client = devis.client || {};
  const clientNom = devis.client_nom || clientDisplayName(client) || 'CLIENT';
  const rows = buildPdfRows(devis, catMap);
  const conditionsText = devis.conditions?.trim() || devis.modalites_paiement?.trim() || DEFAULT_CONDITIONS;
  const footerLayout = getFooterQrLayout(qrMeta);

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
        doc.addImage(
          qrMeta.dataUrl,
          imgFmt(qrMeta.dataUrl),
          qrX,
          qrY,
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
    textRight(doc, fmtNum(row.prix_ht), COL_R[4], midY);
    doc.setFont('helvetica', 'bold');
    textRight(doc, `${fmtNum(row.total_ht)} MAD`, COL_R[5], midY);

    return startY + h;
  };

  const drawTotalsBlock = (startY) => {
    if (showSignature) {
      const blockH = TOTAL_ROW_H * 3;
      const splitX = M + CONTENT_W / 2;
      const leftW = CONTENT_W / 2;
      const rightW = CONTENT_W / 2;
      const tvaPct = getDevisTvaPercent(devis);

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
          doc.addImage(
            signatureMeta.dataUrl,
            imgFmt(signatureMeta.dataUrl),
            sigX,
            sigY,
            sigSize.width,
            sigSize.height,
          );
        } catch { /* skip */ }
      }

      const items = [
        { label: 'Total HT :', value: devis.total_ht, bold: false, fs: 8 },
        { label: `TVA (${tvaPct}%) :`, value: devis.total_tva, bold: false, fs: 8 },
        { label: 'Total TTC :', value: devis.total_ttc, bold: true, fs: 9, ttc: true },
      ];

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
        doc.setTextColor(...TEXT);
        doc.text(item.label, splitX + 3, mid);
        textRight(doc, `${fmtNum(item.value)} MAD`, splitX + rightW - 3, mid);
      });

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.rect(M, startY, CONTENT_W, blockH);

      return startY + blockH;
    }

    const items = [
      { label: 'Total HT', value: devis.total_ht, bold: true, red: false, fs: 8 },
      { label: 'TVA', value: devis.total_tva, bold: false, red: false, fs: 8 },
      { label: 'Total TTC', value: devis.total_ttc, bold: true, red: true, fs: 9 },
    ];
    let cy = startY;
    items.forEach((item) => {
      drawCellBorder(doc, M, cy, LEFT_MERGE_W, TOTAL_ROW_H);
      drawCellBorder(doc, COL_X[5], cy, COL_W[5], TOTAL_ROW_H);
      const mid = cy + TOTAL_ROW_H / 2 + 1;
      doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
      doc.setFontSize(item.fs);
      doc.setTextColor(...(item.red ? RED : TEXT));
      textRight(doc, item.label, LABEL_COL_R, mid);
      textRight(doc, `${fmtNum(item.value)} MAD`, VALUE_COL_R, mid);
      cy += TOTAL_ROW_H;
    });
    return cy;
  };

  const drawConditionsBlock = (startY) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text('Conditions de vente', M, startY);
    let cy = startY + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const condLines = doc.splitTextToSize(conditionsText, CONTENT_W);
    condLines.forEach((line) => {
      doc.text(line, M, cy);
      cy += 3.2;
    });
    return cy + 5;
  };

  const arreteText = buildArreteText(devis.total_ttc);

  const drawArreteBlock = (startY) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(arreteText, CONTENT_W);
    let cy = startY;
    lines.forEach((line) => {
      doc.text(line, M, cy);
      cy += 4.2;
    });
    return cy + 4;
  };

  const measureArreteHeight = () => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(arreteText, CONTENT_W);
    return lines.length * 4.2 + 8;
  };

  /* ── Page 1 header (inchangé) ── */
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

  const addrParts = [client.adresse, client.ville].filter(Boolean);
  if (addrParts.length) {
    const addrLines = doc.splitTextToSize(addrParts.join(' ').toUpperCase(), CLIENT_W);
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
  doc.text(`DEVIS ${devis.reference || ''}`, M, y);
  y += 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.9);
  doc.line(M, y, PAGE_W - M, y);
  y += 7;

  const infoFields = [
    ['Date', fmtDate(devis.date_creation)],
    ['Valable jusqu\'au', fmtDate(devis.date_validite)],
    ['Intitulé', (devis.titre || '—').toUpperCase()],
    ['Réalisé par', (devis.commercial || '—').toUpperCase()],
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

  y = drawConditionsBlock(y);

  /* ── Corps : tableau devis ── */
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

      if (row.kind === 'section') {
        y = drawTableLabelRow(doc, row.text, y, { uppercase: true });
      } else if (row.kind === 'titre') {
        y = drawTableLabelRow(doc, row.text, y, { fontSize: 9, uppercase: true, minH: 8 });
      } else if (row.kind === 'sous_titre') {
        y = drawTableLabelRow(doc, row.text, y, { fontSize: 8, indent: 2, minH: 7 });
      } else if (row.kind === 'note') {
        y = drawTableLabelRow(doc, row.text, y, { fontSize: 7, bold: false, italic: true });
      } else if (row.kind === 'article') {
        y = drawArticleRow(row, y);
      }
    });
  }

  ensureSpace(TOTAL_ROW_H * 3);
  y = drawTotalsBlock(y);

  y += 12;

  const arreteH = measureArreteHeight();
  ensureSpace(arreteH);
  y = drawArreteBlock(y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawWatermark();
    drawFooter(p, totalPages);
  }

  deliverPdf(doc, `Devis_${(devis.reference || 'devis').replace(/\s+/g, '_')}.pdf`, options);
}
