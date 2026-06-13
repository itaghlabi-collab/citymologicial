/**
 * workerPaymentPdf.js — Fiche de paiement ouvrier PDF
 */
import { generatePaymentVoucherPdf, fmtDate, formatPdfMAD } from './paymentPdfShared';

function fmtPdfHours(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} h`;
}

function fmtPdfDay(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function buildAttendancePdfRows(attendanceDays = []) {
  return (attendanceDays || []).map((r) => {
    const date = r.date ? fmtDate(r.date) : '—';
    return [
      date,
      r.heureEntree || '—',
      r.heureSortie || '—',
      r.heuresTravaillees > 0 ? fmtPdfHours(r.heuresTravaillees) : '—',
      r.retardHeures > 0 ? fmtPdfHours(r.retardHeures) : '—',
      r.joursEquivalent > 0 ? fmtPdfDay(r.joursEquivalent) : '—',
      r.statut || '—',
    ];
  });
}

export async function exportWorkerPaymentPdf(record, { attendanceDays = [], print = false } = {}) {
  const ref = record.reference || record.id?.slice(0, 8)?.toUpperCase() || '—';
  const meta = [
    ['Projet / Chantier', record.projet || '—'],
    ['Chef de projet', record.chefProjet || '—'],
    ['Chef de chantier', record.chefChantier || '—'],
    ['Référence', ref],
    ['Ouvrier', record.ouvrier || '—'],
    ['Fonction', record.fonction || '—'],
    ['Semaine', fmtDate(record.semaineDebut) + (record.semaineFin ? ` — ${fmtDate(record.semaineFin)}` : '')],
    ['Date paiement', fmtDate(record.paymentDate || record.semaineDebut)],
    ['Type de paiement', 'Paiement hebdomadaire ouvrier'],
    ['Statut', record.statut || '—'],
    ['Mode de paiement', record.paymentMethod || '—'],
  ];

  const nbJours = attendanceDays.filter((d) => (d.joursEquivalent || 0) > 0).length;
  const totalRetard = attendanceDays.reduce((s, d) => s + (Number(d.retardHeures) || 0), 0);

  const detailRows = [
    ['Jours travaillés', `${nbJours || record.joursPaies} j`, '—', '—'],
    ['Jours équivalents', `${record.joursPaies} j`, formatPdfMAD(record.tarifJournalier) + '/j', formatPdfMAD(record.montantNormales || (record.joursPaies * record.tarifJournalier))],
    ['Heures travaillées', fmtPdfHours(record.heuresNormales || record.joursPaies * 8), formatPdfMAD(record.tarifHoraire) + '/h', formatPdfMAD(record.montantNormales || (record.joursPaies * record.tarifJournalier))],
  ];
  if (totalRetard > 0) {
    detailRows.push(['Total retard', fmtPdfHours(totalRetard), '—', '—']);
  }
  if (Number(record.heuresSup) > 0) {
    detailRows.push(['Heures supplémentaires', `${record.heuresSup} h`, formatPdfMAD(record.tarifSup) + '/h', formatPdfMAD(record.montantSup)]);
  }

  const totals = [
    ['Montant brut', formatPdfMAD(record.montantBrut), false],
    ['Avances déduites', formatPdfMAD(record.avances), false, [230, 81, 0]],
    ['Retenues déduites', formatPdfMAD(record.retenues), false, [198, 40, 40]],
    ['Montant net à payer', formatPdfMAD(record.total), true, [198, 40, 40]],
  ];

  const secondaryRows = buildAttendancePdfRows(attendanceDays);

  await generatePaymentVoucherPdf({
    title: 'FICHE DE PAIEMENT OUVRIER',
    subtitle: 'CITYMO — Ressources Humaines',
    filename: `fiche-paiement-ouvrier-${ref}.pdf`,
    meta,
    detailHeaders: ['Désignation', 'Quantité', 'Tarif', 'Montant'],
    detailRows,
    detailColWidths: [62, 38, 38, 48],
    secondaryTitle: 'Détail des présences (jour par jour)',
    secondaryHeaders: ['Date', 'Entrée', 'Sortie', 'H. trav.', 'Retard', 'Équiv. j', 'Statut'],
    secondaryRows,
    secondaryColWidths: [24, 22, 22, 22, 20, 20, 26],
    totals,
    observations: record.notes || '',
    print,
  });
}
