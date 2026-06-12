/**
 * subcontractorPaymentPdf.js — Bon de paiement sous-traitant PDF
 */
import { paymentTypeLabel } from '../../utils/rh/subcontractorPaymentFormUtils';
import { paymentStatusFromDb } from './subcontractorConstants';
import { generatePaymentVoucherPdf, fmtDate, formatPdfMAD } from './paymentPdfShared';

export async function exportSubcontractorPaymentPdf(record, { print = false } = {}) {
  const ref = record.reference || record.id?.slice(0, 8)?.toUpperCase() || '—';
  const typeLabel = paymentTypeLabel(record.paymentType);

  const meta = [
    ['Projet / Chantier', record.projectName || '—'],
    ['Référence', ref],
    ['Sous-traitant', record.subcontractorName || '—'],
    ['Date paiement', fmtDate(record.paymentDate)],
    ['Type de paiement', typeLabel],
    ['Statut', paymentStatusFromDb(record.status)],
    ['Mode de paiement', record.paymentMethod || '—'],
  ];

  const detailRows = [];
  if (record.paymentType === 'metre') {
    detailRows.push([
      record.designation || 'Prestation',
      `${record.quantity} ${record.unit || ''}`.trim(),
      formatPdfMAD(record.unitPrice),
      formatPdfMAD(record.grossAmount),
    ]);
  } else {
    detailRows.push([
      record.designation || 'Prestation',
      'Forfait',
      '—',
      formatPdfMAD(record.grossAmount || record.amount),
    ]);
  }

  const totals = [
    ['Montant brut', formatPdfMAD(record.grossAmount), false],
    ['Avances déduites', formatPdfMAD(record.avances), false, [230, 81, 0]],
    ['Retenues déduites', formatPdfMAD(record.retenues), false, [198, 40, 40]],
    ['Montant net à payer', formatPdfMAD(record.amount), true, [198, 40, 40]],
  ];

  const obs = [record.description, record.notes].filter(Boolean).join('\n');

  await generatePaymentVoucherPdf({
    title: 'BON DE PAIEMENT SOUS-TRAITANT',
    subtitle: 'CITYMO — Exploitation',
    filename: `bon-paiement-st-${ref}.pdf`,
    meta,
    detailHeaders: ['Désignation', 'Quantité', 'Prix unit.', 'Montant'],
    detailRows,
    detailColWidths: [62, 38, 38, 48],
    totals,
    observations: obs,
    print,
  });
}
