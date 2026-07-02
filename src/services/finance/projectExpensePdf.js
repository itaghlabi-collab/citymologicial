/**
 * projectExpensePdf.js — Export PDF dépenses par projet
 */
import { createFinancePdf, addFinanceFooter, formatPdfMAD } from './pdfShared';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export async function exportProjectExpensesPdf({ project, expenses, periodLabel }) {
  const doc = await createFinancePdf('DÉPENSES PAR PROJET');
  let y = 42;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Projet : ${project.nom}`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Chef de projet : ${project.responsable || project.chef_projet || '—'}`, 14, y);
  y += 5;
  doc.text(`Période : ${periodLabel || 'Toutes périodes'}`, 14, y);
  y += 5;
  const budget = Number(project.budget_approuve) || 0;
  doc.text(`Budget : ${budget ? formatPdfMAD(budget) : '—'}`, 14, y);
  y += 10;

  const cols = [22, 28, 45, 35, 28, 28];
  const headers = ['Date', 'Origine', 'Élément', 'Fournisseur', 'Montant', 'Statut'];
  doc.setFillColor(198, 40, 40);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  let x = 15;
  headers.forEach((h, i) => {
    doc.text(h, x, y + 5);
    x += cols[i];
  });
  y += 9;
  doc.setTextColor(33, 33, 33);
  doc.setFont('helvetica', 'normal');

  const rows = (expenses || []).filter((e) => e.statut !== 'annule');
  let total = 0;
  rows.forEach((e) => {
    if (y > 265) {
      addFinanceFooter(doc, doc.internal.getNumberOfPages());
      doc.addPage();
      y = 20;
    }
    const vals = [
      fmtDate(e.date_depense),
      (e.origine_label || e.origine || '').slice(0, 18),
      (e.element_depense || '').slice(0, 28),
      (e.fournisseur || '—').slice(0, 22),
      formatPdfMAD(e.montant),
      e.statut || 'valide',
    ];
    x = 15;
    vals.forEach((v, i) => {
      doc.text(String(v), x, y);
      x += cols[i];
    });
    total += Number(e.montant) || 0;
    y += 6;
  });

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total dépenses : ${formatPdfMAD(total)}`, 14, y);
  y += 6;
  if (budget > 0) {
    doc.text(`Reste budget : ${formatPdfMAD(budget - total)}`, 14, y);
    y += 6;
  }
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Date d'édition : ${fmtDate(new Date().toISOString())}`, 14, y);
  y += 10;
  doc.text('Signature :', 14, y);
  doc.line(35, y, 90, y);

  addFinanceFooter(doc, doc.internal.getNumberOfPages());
  const safeName = (project.nom || 'projet').replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`Depenses_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
