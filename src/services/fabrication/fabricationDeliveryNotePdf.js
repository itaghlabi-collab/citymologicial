/**
 * fabricationDeliveryNotePdf.js — PDF Bon de livraison Fabrication CITYMO
 * Réutilise purchasePdfShared (en-tête / tableau) sans modifier les helpers partagés.
 */
import {
  createAchatsPdfDoc,
  drawAchatsHeader,
  drawSectionTitle,
  drawDataTable,
  downloadPdfBlob,
  safeFilename,
  fmtDate,
  pdfSafeText,
  dash,
  MARGIN,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
  PDF_RED,
  PDF_TEXT,
  PDF_MUTED,
  PDF_BORDER,
} from '../achats/purchasePdfShared';

function drawDestinataireBox(doc, bl, startY) {
  let y = drawSectionTitle(doc, 'DESTINATAIRE', startY);
  const pad = 4;
  const labelW = 28;
  const valueW = CONTENT_W - pad * 2 - labelW;
  const rows = [
    ['Societe', bl.client_societe],
    ['Nom', bl.destinataire_nom],
    ['Adresse', bl.adresse],
    ['Telephone', bl.telephone],
  ].map(([label, value]) => {
    const text = pdfSafeText(dash(value));
    const lines = doc.splitTextToSize(text, valueW);
    return { label, lines: lines.length ? lines : ['-'] };
  });

  const lineH = 4.6;
  const contentH = rows.reduce((sum, r) => sum + Math.max(lineH, r.lines.length * lineH), 0);
  const boxH = pad * 2 + contentH + 2;

  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.25);
  doc.setFillColor(252, 252, 252);
  doc.rect(MARGIN, y, CONTENT_W, boxH, 'FD');

  let ty = y + pad + 3.2;
  rows.forEach((row) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(`${row.label} :`, MARGIN + pad, ty);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_TEXT);
    row.lines.forEach((line, i) => {
      doc.text(line, MARGIN + pad + labelW, ty + i * lineH);
    });
    ty += Math.max(lineH, row.lines.length * lineH);
  });

  return y + boxH + 8;
}

function drawVisaClient(doc, startY) {
  const minBoxH = 62;
  let y = startY;
  if (y + minBoxH + 10 > PAGE_H - MARGIN) {
    doc.addPage();
    y = MARGIN;
  }

  y = drawSectionTitle(doc, 'VISA CLIENT', y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_TEXT);
  doc.text('Nom : ________________________________', MARGIN, y);
  doc.text('Date : ____ / ____ / ________', MARGIN + CONTENT_W / 2, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text('Signature & cachet :', MARGIN, y);
  y += 3;

  const boxH = Math.max(minBoxH, PAGE_H - MARGIN - y - 4);
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(MARGIN, y, CONTENT_W, boxH, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('Espace reserve a la signature et au cachet du client', MARGIN + CONTENT_W / 2, y + boxH / 2, {
    align: 'center',
  });

  return y + boxH;
}

/**
 * @param {object} bl — bon de livraison Fabrication normalisé
 */
export async function generateFabricationDeliveryNotePdf(bl) {
  const doc = createAchatsPdfDoc();
  const lines = bl.lines || bl.lignes || [];

  let y = await drawAchatsHeader(doc, 'BON DE LIVRAISON', [
    ['N° BL', bl.numero || '-'],
    ['Date', fmtDate(bl.date_bl)],
    ['Statut', bl.statut || '-'],
  ]);

  y = drawDestinataireBox(doc, bl, y);

  y = drawSectionTitle(doc, 'ELEMENTS LIVRES', y);

  const tableRows = lines.map((l, i) => ({
    n: String(i + 1),
    designation: l.designation || '-',
    quantite: l.quantite === '' || l.quantite == null ? '-' : String(l.quantite),
  }));

  if (tableRows.length === 0) {
    tableRows.push({ n: '—', designation: 'Aucune ligne', quantite: '—' });
  }

  y = drawDataTable(
    doc,
    [
      { key: 'n', label: 'N°', width: 14, align: 'center' },
      { key: 'designation', label: 'DESIGNATION', width: 130, align: 'left', wrap: true },
      { key: 'quantite', label: 'QUANTITE', width: 28, align: 'center' },
    ],
    tableRows,
    y,
  );

  y += 6;
  drawVisaClient(doc, y);

  const blob = doc.output('blob');
  downloadPdfBlob(blob, safeFilename(bl.numero, 'BL-Fabrication'));
  return blob;
}
