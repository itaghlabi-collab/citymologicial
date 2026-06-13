/**
 * workerPaymentPdf.js — Fiche de paiement ouvrier PDF
 */
import { generatePaymentVoucherPdf, fmtDate, formatPdfMAD } from './paymentPdfShared';

export async function exportWorkerPaymentPdf(record, { print = false } = {}) {
  const ref = record.reference || record.id?.slice(0, 8)?.toUpperCase() || '—';
  const meta = [
    ['Projet / Chantier', record.projet || '—'],
    ['Référence', ref],
    ['Ouvrier', record.ouvrier || '—'],
    ['Fonction', record.fonction || '—'],
    ['Semaine du', fmtDate(record.semaineDebut)],
    ['Date paiement', fmtDate(record.paymentDate || record.semaineDebut)],
    ['Type de paiement', 'Paiement hebdomadaire ouvrier'],
    ['Statut', record.statut || '—'],
    ['Mode de paiement', record.paymentMethod || '—'],
  ];

  const detailRows = [
    ['Jours travaillés', `${record.joursPaies} j`, formatPdfMAD(record.tarifJournalier) + '/j', formatPdfMAD(record.montantNormales || (record.joursPaies * record.tarifJournalier))],
  ];
  if (Number(record.heuresSup) > 0) {
    detailRows.push(['Heures supplémentaires', `${record.heuresSup} h`, formatPdfMAD(record.tarifSup) + '/h', formatPdfMAD(record.montantSup)]);
  }

  const totals = [
    ['Montant brut', formatPdfMAD(record.montantBrut), false],
    ['Avances déduites', formatPdfMAD(record.avances), false, [230, 81, 0]],
    ['Retenues déduites', formatPdfMAD(record.retenues), false, [198, 40, 40]],
    ['Montant net à payer', formatPdfMAD(record.total), true, [198, 40, 40]],
  ];

  await generatePaymentVoucherPdf({
    title: 'FICHE DE PAIEMENT OUVRIER',
    subtitle: 'CITYMO — Ressources Humaines',
    filename: `fiche-paiement-ouvrier-${ref}.pdf`,
    meta,
    detailHeaders: ['Désignation', 'Quantité', 'Tarif', 'Montant'],
    detailRows,
    detailColWidths: [62, 38, 38, 48],
    totals,
    observations: record.notes || '',
    print,
  });
}
