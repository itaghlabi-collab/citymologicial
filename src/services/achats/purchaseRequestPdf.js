/**
 * purchaseRequestPdf.js — PDF métier Demande d'achat CITYMO
 */
import { PURCHASE_ASSIGNEE, normalizePurchaseStatus, getPurchaseStatusLabel } from '../../constants/purchaseWorkflow';
import { getPurchaseRequestLineSummary } from './purchaseRequests';
import {
  createAchatsPdfDoc,
  drawAchatsHeader,
  drawSectionTitle,
  drawKeyValueTable,
  drawDataTable,
  drawSignatureBoxes,
  drawFooter,
  normalizeRequestLines,
  downloadPdfBlob,
  safeFilename,
  fmtDate,
  PAGE_W,
} from './purchasePdfShared';

export async function generatePurchaseRequestPdf(request, { attachments = [] } = {}) {
  const doc = createAchatsPdfDoc();

  const projet = request.projet_lie || request.project_name || request.project_ref || '—';
  const lineSummary = getPurchaseRequestLineSummary(request);
  const fournisseur = lineSummary.fournisseur || '—';
  const requestLines = normalizeRequestLines(request);
  const quantiteLabel = requestLines.length > 1
    ? `${requestLines.length} lignes`
    : (lineSummary.quantite !== '' && lineSummary.quantite != null
      ? `${lineSummary.quantite} ${lineSummary.unite || 'u'}`
      : '—');

  let y = await drawAchatsHeader(doc, 'DEMANDE D\'ACHAT', [
    ['Référence', request.ref],
    ['Date', fmtDate(request.date_creation || request.created_at)],
    ['Projet lié', projet],
    ['Demandeur', request.requester_name || request.demandeur],
    ['Resp. Achats', request.assigned_employee_name || PURCHASE_ASSIGNEE.label],
    ['Priorité', request.priorite],
    ['Statut', getPurchaseStatusLabel(request.statut)],
  ]);

  y = drawSectionTitle(doc, 'OBJET DE LA DEMANDE', y);
  y = drawKeyValueTable(doc, [
    ['Titre', request.titre],
    ['Fournisseur souhaité', fournisseur],
    ['Quantité demandée', quantiteLabel],
    ['Description du besoin', request.description],
    ['Date souhaitée', fmtDate(request.date_limite)],
    ['Commentaires internes', request.commentaires_internes],
  ], y);

  const attachList = attachments.length
    ? attachments.map((a) => a.name || a.url || a).join(', ')
    : (request.payload?.attachments?.length
      ? request.payload.attachments.map((a) => a.name || a).join(', ')
      : '-');

  if (attachList !== '-') {
    y = drawKeyValueTable(doc, [['Pièces jointes', attachList]], y);
  }

  y = drawSectionTitle(doc, 'ARTICLES / BESOINS', y);
  y = drawDataTable(doc, [
    { label: 'Désignation', key: 'designation', width: 52 },
    { label: 'Qté', key: 'quantite', width: 18 },
    { label: 'Unité', key: 'unite', width: 18 },
    { label: 'Fournisseur', key: 'fournisseur', width: 38 },
    { label: 'Observation', key: 'observation', width: 54 },
  ], normalizeRequestLines(request).map((line) => ({
    ...line,
    fournisseur: line.fournisseur || fournisseur,
  })), y);

  y = drawSectionTitle(doc, 'VALIDATION', y + 2);
  y = drawSignatureBoxes(doc, [
    'Signature demandeur',
    'Chargée d\'Achats',
    'Validation DG',
  ], y, 24);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('Cachet société', PAGE_W / 2, y, { align: 'center' });
  doc.rect(PAGE_W / 2 - 18, y + 2, 36, 14);

  drawFooter(doc, 'DOCUMENT INTERNE CITYMO — DEMANDE D\'ACHAT');

  const filename = safeFilename(request.ref, 'demande-achat');
  downloadPdfBlob(doc.output('blob'), filename);
}
