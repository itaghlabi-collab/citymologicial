/**
 * siteRequestShippingLabelPdf.js — Étiquettes colis 100×150 mm pour les demandes chantier
 * (une page par colis, QR vers la fiche de la demande dans l’ERP).
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { setupPdfUnicodeFont, setPdfFont } from '../finance/pdfUnicode';
import { isPreparationBon, decodeSourceEmplacement } from './siteRequestPreparation';

const W = 100;
const H = 150;
const M = 5;
const CW = W - M * 2;

const RED = [198, 40, 40];
const TEXT = [20, 20, 20];
const MUTED = [95, 95, 95];
const BORDER = [160, 160, 160];
const SOFT_BG = [246, 246, 246];

export const SITE_REQUEST_LINK_PARAM = 'dc';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL scannée : ouvre la demande dans le module Demandes chantier. */
export function getSiteRequestLinkUrl(id) {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/?module=demandes-chantier&${SITE_REQUEST_LINK_PARAM}=${encodeURIComponent(id)}`;
}

/** Lit puis retire ?dc=<id> de l’URL (ouverture via QR étiquette). */
export function consumeSiteRequestLinkParam() {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(SITE_REQUEST_LINK_PARAM);
    if (!id) return null;
    url.searchParams.delete(SITE_REQUEST_LINK_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
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

function collectSources(lines) {
  const set = new Set();
  lines.forEach((l) => {
    const src = l.emplacement_source || decodeSourceEmplacement(l.remarque).emplacement;
    if (src) set.add(String(src).trim());
  });
  return [...set].join(' · ') || 'Dépôt CITYMO';
}

function fitText(doc, text, maxW, maxLines) {
  const lines = doc.splitTextToSize(String(text || '—'), maxW);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  return kept;
}

function drawField(doc, setFont, label, value, x, y, w, { size = 9, maxLines = 1 } = {}) {
  setFont('bold');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x, y);
  setFont('bold');
  doc.setFontSize(size);
  doc.setTextColor(...TEXT);
  const lines = fitText(doc, value, w, maxLines);
  const lh = size * 0.42;
  lines.forEach((line, i) => doc.text(line, x, y + 1.2 + lh * (i + 1)));
  return y + 1.2 + lh * lines.length + 4.5;
}

function capitalize(s) {
  const v = String(s || '').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
}

function drawLabelPage(doc, setFont, request, ctx, colisIdx, colisTotal) {
  // Bordure de découpe
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(1.5, 1.5, W - 3, H - 3);

  // En-tête : logo + numéro de colis
  const headTop = M;
  if (ctx.logo?.dataUrl) {
    try {
      doc.addImage(ctx.logo.dataUrl, 'PNG', M, headTop, ctx.logo.w, ctx.logo.h);
    } catch { /* logo optionnel */ }
  } else {
    setFont('bold');
    doc.setFontSize(16);
    doc.setTextColor(...RED);
    doc.text('CITYMO', M, headTop + 8);
  }

  const boxW = 30;
  const boxH = 16;
  const boxX = W - M - boxW;
  doc.setFillColor(...RED);
  doc.roundedRect(boxX, headTop, boxW, boxH, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  setFont('bold');
  doc.setFontSize(6.5);
  doc.text('COLIS', boxX + boxW / 2, headTop + 4.6, { align: 'center' });
  doc.setFontSize(15);
  doc.text(`${colisIdx}/${colisTotal}`, boxX + boxW / 2, headTop + 12.6, { align: 'center' });

  let y = headTop + boxH + 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);

  // Référence de la demande
  y += 9;
  setFont('bold');
  doc.setFontSize(20);
  doc.setTextColor(...TEXT);
  doc.text(request.ref || '—', W / 2, y, { align: 'center' });
  y += 5;
  setFont('normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `${ctx.kind} · ${fmtDate(request.date_demande || request.created_at)}`,
    W / 2, y, { align: 'center' },
  );

  // Bloc destination
  y += 4;
  const destTop = y;
  setFont('bold');
  doc.setFontSize(13);
  const nameLineCount = fitText(doc, request.project_name, CW - 7, 2).length;
  const destH = 19 + 5.46 * nameLineCount;
  doc.setFillColor(...SOFT_BG);
  doc.rect(M, destTop, CW, destH, 'F');
  doc.setFillColor(...RED);
  doc.rect(M, destTop, 1.4, destH, 'F');
  let dy = destTop + 5;
  dy = drawField(doc, setFont, 'Destination / projet', request.project_name, M + 4, dy, CW - 7, { size: 13, maxLines: 2 });
  const half = (CW - 7) / 2;
  drawField(doc, setFont, 'Réf. projet', request.project_ref, M + 4, dy, half - 2, { size: 8.5 });
  drawField(doc, setFont, 'Client', request.client_name, M + 4 + half, dy, half, { size: 8.5 });

  // Contacts + source
  y = destTop + destH + 4.5;
  drawField(doc, setFont, 'Chef de chantier', request.chef_chantier, M, y, CW / 2 - 2, { size: 8.5 });
  y = drawField(doc, setFont, 'Chef de projet', request.chef_projet, M + CW / 2, y, CW / 2, { size: 8.5 });
  y = drawField(doc, setFont, 'Expédié depuis', ctx.sources, M, y, CW, { size: 8.5 });

  // QR code
  const qrSize = 38;
  const qrTop = y;
  if (ctx.qr) {
    doc.addImage(ctx.qr, 'PNG', M, qrTop, qrSize, qrSize);
  }
  const infoX = M + qrSize + 4;
  const infoW = CW - qrSize - 4;
  let iy = qrTop + 4;
  iy = drawField(doc, setFont, 'Articles', `${ctx.articleCount} ligne${ctx.articleCount > 1 ? 's' : ''}`, infoX, iy, infoW, { size: 9 });
  iy = drawField(doc, setFont, 'Date souhaitée', fmtDate(request.date_souhaitee), infoX, iy, infoW, { size: 9 });
  drawField(doc, setFont, 'Priorité', capitalize(request.priorite), infoX, iy, infoW, { size: 9 });

  setFont('normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text('Scanner pour ouvrir la demande', M + qrSize / 2, qrTop + qrSize + 3, { align: 'center' });

  // Pied
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(M, H - 10, W - M, H - 10);
  setFont('bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT);
  doc.text('CITYMO — Matériel chantier', M, H - 6);
  setFont('normal');
  doc.setTextColor(...MUTED);
  doc.text('À vérifier à la réception', W - M, H - 6, { align: 'right' });
}

/** Télécharge un PDF 100×150 mm avec une étiquette par colis. */
export async function generateSiteRequestShippingLabels(request, colisCount = 1) {
  const total = Math.max(1, Math.min(99, Math.floor(Number(colisCount) || 1)));
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true });

  let unicode = true;
  try {
    await setupPdfUnicodeFont(doc);
  } catch {
    unicode = false;
  }
  const setFont = (style) => {
    if (unicode) setPdfFont(doc, style);
    else doc.setFont('helvetica', style);
  };

  const [logo, qr] = await Promise.all([
    loadCompanyLogoFit(42, 14).catch(() => null),
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(getSiteRequestLinkUrl(request.id), {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 480,
        color: { dark: '#000000', light: '#ffffff' },
      }))
      .catch(() => null),
  ]);

  const activeLines = (request.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
  const ctx = {
    logo,
    qr,
    kind: isPreparationBon(request) ? 'Bon de préparation' : 'Demande chantier',
    sources: collectSources(activeLines),
    articleCount: activeLines.length,
  };

  for (let i = 1; i <= total; i += 1) {
    if (i > 1) doc.addPage([W, H], 'portrait');
    drawLabelPage(doc, setFont, request, ctx, i, total);
  }

  doc.save(`etiquettes-colis-${(request.ref || 'DC').replace(/[^\w-]+/g, '-')}.pdf`);
}
