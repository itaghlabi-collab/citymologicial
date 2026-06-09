/**
 * paymentOrderPdf.js — Export PDF ordre de paiement
 */
import { createFinancePdf, addFinanceFooter, formatPdfMAD, TEXT, MUTED } from './pdfShared';

export async function exportPaymentOrderPdf(order) {
  const doc = await createFinancePdf('ORDRE DE PAIEMENT');
  let y = 42;

  const lines = [
    ['N° ordre', order.ref || '—'],
    ['Date', order.date || '—'],
    ['Bénéficiaire', order.beneficiaire || '—'],
    ['Montant', formatPdfMAD(order.montant)],
    ['Motif', order.motif || '—'],
    ['Mode paiement', order.mode_paiement || '—'],
    ['Statut', order.statut || '—'],
    ['Préparé par', order.prepare_par || '—'],
    ['Validé par', order.valide_par || '—'],
    ['Observation', order.observation || order.commentaire || '—'],
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  lines.forEach(([label, val]) => {
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(String(val), 70, y);
    y += 8;
  });

  y += 12;
  doc.setDrawColor(180, 180, 180);
  doc.line(14, y, 100, y);
  doc.line(120, y, 196, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Signature préparateur', 14, y);
  doc.text('Signature validateur', 120, y);

  addFinanceFooter(doc, 1);
  doc.save(`ordre-paiement-${(order.ref || order.id || 'op').replace(/\s/g, '-')}.pdf`);
}
