/**
 * subcontractorProjectPdf.js — Relevé sous-traitant par projet
 */
import { jsPDF } from 'jspdf';
import { subcontractorFullName, subcontractorCinLabel } from './subcontractors';
import { SERVICE_STATUS_LABEL, PAYMENT_BALANCE_LABEL } from './subcontractorConstants';

const RED = [183, 28, 28];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const MARGIN = 14;
const PAGE_W = 210;

function fmtMAD(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-MA');
  } catch {
    return d;
  }
}

export async function generateSubcontractorProjectPdf({
  subcontractor,
  balance,
  services = [],
  payments = [],
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...RED);
  doc.text('RELEVÉ SOUS-TRAITANT PAR PROJET', MARGIN, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-MA')}`, MARGIN, y);
  y += 10;

  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(subcontractorFullName(subcontractor), MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CIN / Passeport : ${subcontractorCinLabel(subcontractor)}`, MARGIN, y);
  y += 5;
  doc.text(`Projet : ${balance?.projectName || '—'}`, MARGIN, y);
  y += 5;
  if (balance?.remunerationType) {
    doc.text(`Type rémunération : ${balance.remunerationType}`, MARGIN, y);
    y += 5;
  }
  y += 4;

  const projectServices = services.filter((s) => s.assignmentId === balance?.assignmentId);
  const projectPayments = payments.filter((p) => p.assignmentId === balance?.assignmentId);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Prestations réalisées', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  if (!projectServices.length) {
    doc.text('Aucune prestation.', MARGIN, y);
    y += 6;
  } else {
    projectServices.forEach((s) => {
      doc.text(
        `${fmtDate(s.serviceDate)} — ${s.description || 'Prestation'} — ${s.quantity} ${s.unitType || ''} × ${fmtMAD(s.unitPrice)} = ${fmtMAD(s.totalAmount)} (${SERVICE_STATUS_LABEL[s.status] || s.status})`,
        MARGIN,
        y,
        { maxWidth: PAGE_W - MARGIN * 2 },
      );
      y += 5;
      if (y > 270) { doc.addPage(); y = MARGIN; }
    });
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('Paiements', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  if (!projectPayments.length) {
    doc.text('Aucun paiement.', MARGIN, y);
    y += 6;
  } else {
    projectPayments.forEach((p) => {
      doc.text(
        `${fmtDate(p.paymentDate)} — ${fmtMAD(p.amount)} — ${p.paymentMethod || ''} ${p.reference ? `(${p.reference})` : ''}`,
        MARGIN,
        y,
      );
      y += 5;
    });
  }

  y += 8;
  doc.setDrawColor(...RED);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  const rows = [
    ['Total prestations', fmtMAD(balance?.totalServicesAmount)],
    ['Total payé', fmtMAD(balance?.totalPaidAmount)],
    ['Reste à payer', fmtMAD(balance?.remainingAmount)],
    ['Statut paiement', PAYMENT_BALANCE_LABEL[balance?.paymentStatus] || balance?.paymentStatus || '—'],
  ];
  doc.setFont('helvetica', 'bold');
  rows.forEach(([k, v]) => {
    doc.text(k, MARGIN, y);
    doc.text(v, PAGE_W - MARGIN, y, { align: 'right' });
    y += 6;
  });

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Signature / validation :', MARGIN, y);
  doc.line(MARGIN + 42, y, PAGE_W - MARGIN, y);

  const name = `releve-${(subcontractorFullName(subcontractor) || 'st').replace(/\s+/g, '-')}-${(balance?.projectName || 'projet').replace(/\s+/g, '-')}.pdf`;
  doc.save(name.slice(0, 120));
}
