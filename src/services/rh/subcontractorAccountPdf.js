/**
 * PDF additif — État global compte sous-traitant.
 * Ne modifie pas le moteur des bons de paiement existants.
 */
import { jsPDF } from 'jspdf';
import { formatPdfMAD, TEXT, MUTED, RED, BORDER, loadCompanyLogoFit } from '../finance/pdfShared';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return String(iso); }
}

export async function exportSubcontractorAccountPdf(account, { print = false } = {}) {
  if (!account?.subcontractor) throw new Error('Compte requis.');
  const sub = account.subcontractor;
  const k = account.kpis || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;

  try {
    const logo = await loadCompanyLogoFit(40, 14);
    if (logo) {
      doc.addImage(logo.dataUrl, 'PNG', 14, 10, logo.w, logo.h);
      y = 28;
    }
  } catch { /* ignore */ }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...RED);
  doc.text('État global sous-traitant', 14, y);
  y += 8;
  doc.setDrawColor(...BORDER);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  const meta = [
    ['Sous-traitant', sub.fullName],
    ['Métier', sub.fonction || '—'],
    ['Téléphone', sub.telephone || '—'],
    ['Période', `au ${fmtDate(new Date().toISOString())}`],
  ];
  meta.forEach(([l, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(l, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(String(v), 55, y);
    y += 6;
  });
  y += 4;

  const kpis = [
    ['Avances versées', formatPdfMAD(k.avancesVersees)],
    ['Avances consommées', formatPdfMAD(k.avancesConsommees)],
    ['Reliquat', formatPdfMAD(k.reliquatAvance)],
    ['Travaux réalisés', formatPdfMAD(k.travauxRealises)],
    ['Montants payés', formatPdfMAD(k.montantsPayes)],
    ['Retenues', formatPdfMAD(k.retenues)],
    ['Reste à payer', formatPdfMAD(k.resteAPayer)],
    ['Projets', String(k.nombreProjets || 0)],
    ['Situations ouvertes', String(k.situationsOuvertes || 0)],
    ['Situations clôturées', String(k.situationsCloturees || 0)],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Synthèse', 14, y);
  y += 7;
  doc.setFontSize(9);
  kpis.forEach(([l, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(l, 14, y);
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'bold');
    doc.text(v, 90, y);
    y += 5.5;
  });

  y += 6;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Situations', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  (account.situations || []).slice(0, 25).forEach((s) => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(
      `${s.reference || '—'} | ${s.projectName || '—'} | ${formatPdfMAD(s.grossAmount)} | ${s.statusLabel || s.status}`,
      14,
      y,
    );
    y += 5;
  });

  y += 8;
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Document généré par CITYMO — signatures selon procédure existante.', 14, y);

  const name = `etat-st-${(sub.fullName || 'compte').replace(/\s+/g, '-').toLowerCase()}.pdf`;
  if (print) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(name);
  }
}
