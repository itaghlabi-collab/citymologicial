/**
 * purchaseAcquisitionOrderPdf.js — PDF métier Ordre d'achat CITYMO
 */
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';
import {
  createAchatsPdfDoc,
  drawAchatsHeader,
  drawSectionTitle,
  drawKeyValueTable,
  drawDataTable,
  drawSignatureBoxes,
  drawFooter,
  normalizeOaLines,
  downloadPdfBlob,
  safeFilename,
  fmtDate,
  formatPdfMAD,
} from './purchasePdfShared';

export async function generateAcquisitionOrderPdf(oa, { quote, request } = {}) {
  const doc = createAchatsPdfDoc();
  const tva = Number(oa.tva_rate ?? oa.tva) || 20;
  const ht = Number(oa.montant_ht) || 0;
  const ttc = Number(oa.montant_ttc) || ht * (1 + tva / 100);

  let y = await drawAchatsHeader(doc, 'ORDRE D\'ACHAT', [
    ['Référence OA', oa.ref || oa.ref_oa],
    ['Référence DA', oa.purchase_request_ref || request?.ref],
    ['Date', fmtDate(oa.date_creation || oa.created_at)],
    ['Projet', oa.projet_lie || oa.project_name || request?.projet_lie],
    ['Fournisseur', oa.supplier_name],
    ['Statut', oa.statut],
  ]);

  y = drawSectionTitle(doc, 'CONDITIONS COMMERCIALES', y);
  y = drawKeyValueTable(doc, [
    ['Objet', oa.objet],
    ['Montant HT', formatPdfMAD(ht)],
    ['TVA', `${tva}%`],
    ['Montant TTC', formatPdfMAD(ttc)],
    ['Conditions de paiement', oa.conditions_paiement || quote?.conditions_paiement],
    ['Délai de livraison', oa.delai || quote?.delai],
    ['Devis retenu', quote?.ref_devis || quote?.ref_devis_fournisseur || '—'],
    ['Responsable achats', oa.responsable_achats || PURCHASE_ASSIGNEE.label],
  ], y);

  const lines = normalizeOaLines(oa);
  y = drawSectionTitle(doc, 'DÉTAIL ARTICLES / PRESTATIONS', y);
  y = drawDataTable(doc, [
    { label: 'Article / Prestation', key: 'designation', width: 65 },
    { label: 'Qté', key: 'quantite', width: 18 },
    { label: 'P.U. HT', key: 'prix_unitaire', width: 28, format: (v) => formatPdfMAD(v) },
    { label: 'Total HT', key: 'total_ht', width: 28, format: (v) => formatPdfMAD(v) },
  ], lines, y);

  y = drawDataTable(doc, [
    { label: '', key: 'label', width: 111 },
    { label: 'TVA', key: 'tva', width: 28 },
    { label: 'Total TTC', key: 'ttc', width: 41 },
  ], [
    { label: 'TOTAUX', tva: `${tva}%`, ttc: formatPdfMAD(ttc) },
  ], y);

  y = drawSectionTitle(doc, 'SIGNATURES', y + 2);
  y = drawSignatureBoxes(doc, [
    'Chargée d\'Achats',
    'Direction Générale',
    'Fournisseur',
  ], y, 24);

  drawFooter(doc, 'DOCUMENT INTERNE CITYMO — ORDRE D\'ACHAT');

  const filename = safeFilename(oa.ref || oa.ref_oa, 'ordre-achat');
  downloadPdfBlob(doc.output('blob'), filename);
}
