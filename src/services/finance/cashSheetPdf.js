/**
 * cashSheetPdf.js — Export PDF feuille de caisse mensuelle
 */
import { createFinancePdf, addFinanceFooter, formatPdfMAD, TEXT, MUTED } from './pdfShared';

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export async function exportCashSheetPdf({ year, month, transactions, totals, balance }) {
  const title = `FEUILLE DE CAISSE — ${MOIS[month] || month} ${year}`;
  const doc = await createFinancePdf(title);
  let y = 42;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Solde initial : ${formatPdfMAD(totals.soldeInitial)}`, 14, y);
  doc.text(`Alimentation : ${formatPdfMAD(totals.alimentation)}`, 80, y);
  y += 6;
  doc.text(`Total entrées : ${formatPdfMAD(totals.totalEntrees)}`, 14, y);
  doc.text(`Total sorties : ${formatPdfMAD(totals.totalSorties)}`, 80, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT);
  doc.text(`Solde caisse du mois : ${formatPdfMAD(totals.soldeMois)}`, 14, y);
  y += 10;

  const cols = [22, 38, 52, 28, 28, 22];
  const headers = ['Date', 'Contrepartie', 'Description', 'Sortie', 'Entrée', 'Paiement'];
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y, 182, 7, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  let x = 14;
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y + 5);
    x += cols[i];
  });
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  (transactions || []).forEach((t) => {
    if (y > 268) {
      addFinanceFooter(doc, 1);
      doc.addPage();
      y = 20;
    }
    const row = [
      t.date || '',
      (t.contrepartie || '').slice(0, 22),
      (t.description || '').slice(0, 30),
      t.sens === 'sortie' ? formatPdfMAD(t.montant) : '',
      t.sens === 'entree' ? formatPdfMAD(t.montant) : '',
      (t.mode_paiement || '').slice(0, 12),
    ];
    x = 14;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 1, y, { maxWidth: cols[i] - 2 });
      x += cols[i];
    });
    y += 6;
  });

  if (balance?.notes) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Notes : ${balance.notes}`, 14, y);
  }

  addFinanceFooter(doc, 1);
  doc.save(`feuille-caisse-${year}-${String(month).padStart(2, '0')}.pdf`);
}
