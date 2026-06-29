/**
 * purchasePaymentOrderAchatsPdf.js — PDF métier Ordre de paiement Achats CITYMO
 */
import {
  createAchatsPdfDoc,
  drawAchatsHeader,
  drawSectionTitle,
  drawKeyValueTable,
  drawSignatureBoxes,
  drawFooter,
  downloadPdfBlob,
  safeFilename,
  fmtDate,
  formatPdfMAD,
  PAGE_W,
  MARGIN,
} from './purchasePdfShared';

export async function generateAchatsPaymentOrderPdf(op, { supplier, request, oa } = {}) {
  const doc = createAchatsPdfDoc();
  const montant = Number(op.montant_ttc ?? op.montant) || 0;
  const ht = Number(op.montant_ht) || montant / (1 + (Number(op.tva_rate) || 20) / 100);

  let y = await drawAchatsHeader(doc, 'ORDRE DE PAIEMENT', [
    ['Référence OP', op.ref],
    ['Référence OA', op.purchase_oa_ref || oa?.ref],
    ['Référence DA', op.purchase_request_ref || request?.ref],
    ['Date', fmtDate(op.date || op.created_at)],
    ['Projet lié', request?.projet_lie || request?.project_name || '—'],
    ['Statut', op.statut],
  ]);

  y = drawSectionTitle(doc, 'BÉNÉFICIAIRE & PAIEMENT', y);
  y = drawKeyValueTable(doc, [
    ['Fournisseur', op.fournisseur_lie || op.beneficiaire || supplier?.company_name],
    ['Banque fournisseur', supplier?.bank || supplier?.banque || '—'],
    ['RIB', supplier?.rib || '—'],
    ['Montant HT', formatPdfMAD(ht)],
    ['TVA', `${op.tva_rate ?? 20}%`],
    ['Montant à payer (TTC)', formatPdfMAD(montant)],
    ['Mode de paiement', op.mode_paiement || 'Virement'],
    ['Date prévue paiement', fmtDate(op.date_prevue || op.date)],
    ['Motif du paiement', op.motif || op.commentaire],
    ['Observation', op.observation || '—'],
  ], y);

  y = drawSectionTitle(doc, 'VALIDATION', y + 2);
  y = drawSignatureBoxes(doc, [
    'Préparé par',
    'Validé DG',
    'Comptabilité',
  ], y, 24);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Date paiement : ${fmtDate(op.date_paiement)}`, MARGIN, y);
  y += 8;
  doc.text('Cachet société', PAGE_W / 2, y, { align: 'center' });
  doc.rect(PAGE_W / 2 - 18, y + 2, 36, 14);

  drawFooter(doc, 'DOCUMENT INTERNE CITYMO — ORDRE DE PAIEMENT');

  const filename = safeFilename(op.ref, 'ordre-paiement');
  downloadPdfBlob(doc.output('blob'), filename);
}
