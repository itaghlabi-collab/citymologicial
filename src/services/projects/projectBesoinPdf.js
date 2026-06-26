/**
 * projectBesoinPdf.js — PDF fiche besoin ressource RH
 */
import { jsPDF } from 'jspdf';
import { setupPdfUnicodeFont, setPdfFont } from '../finance/pdfUnicode';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { besoinStatutLabel } from '../../constants/projectBesoins';

const M = 12;
const PAGE_W = 210;
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [180, 180, 180];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

export async function generateBesoinPdf(need, projet = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await setupPdfUnicodeFont(doc);
  const logo = await loadCompanyLogoFit(44, 18);

  let y = M;
  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, 'PNG', M, y, logo.w || logo.width, logo.h || logo.height);
  }

  setPdfFont(doc, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...RED);
  doc.text('FICHE BESOIN RESSOURCE CHANTIER', PAGE_W - M, y + 8, { align: 'right' });
  y += 22;

  doc.setDrawColor(...RED);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  const rows = [
    ['Référence', need.ref_besoin || '—'],
    ['Projet', projet.nom || need.project_name || '—'],
    ['Client', projet.client || '—'],
    ['Chef de projet', projet.chef_projet || projet.responsable || '—'],
    ['Chef de chantier', projet.chef_chantier || '—'],
    ['Type / Fonction', `${need.type_besoin} — ${need.fonction}`],
    ['Quantité demandée', String(need.quantite_necessaire)],
    ['Quantité affectée', String(need.quantite_affectee)],
    ['Manque', String(need.manque)],
    ['Date début', fmtDate(need.date_debut_souhaitee)],
    ['Date fin', fmtDate(need.date_fin_estimee)],
    ['Priorité', need.priorite || '—'],
    ['Statut', besoinStatutLabel(need.statut)],
    ['Responsable', need.responsable_demande || '—'],
  ];

  setPdfFont(doc, 'normal');
  doc.setFontSize(9);
  rows.forEach(([label, value]) => {
    doc.setTextColor(...MUTED);
    doc.text(`${label} :`, M, y);
    doc.setTextColor(...TEXT);
    doc.text(String(value), M + 48, y);
    y += 6;
  });

  y += 4;
  const blocks = [
    ['Description des travaux', need.description_travaux],
    ['Compétences recherchées', need.competences],
    ['EPI obligatoires', need.epi_obligatoires],
    ['Observations', need.observation],
  ];

  blocks.forEach(([title, text]) => {
    if (!text?.trim()) return;
    if (y > 250) { doc.addPage(); y = M; }
    setPdfFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), M, y);
    y += 5;
    setPdfFont(doc, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(text.trim(), PAGE_W - M * 2);
    doc.text(lines, M, y);
    y += lines.length * 4.5 + 6;
  });

  if ((need.ressources_affectees || []).length) {
    if (y > 240) { doc.addPage(); y = M; }
    setPdfFont(doc, 'bold');
    doc.setFontSize(8);
    doc.text('RESSOURCES AFFECTÉES', M, y);
    y += 6;
    setPdfFont(doc, 'normal');
    doc.setFontSize(9);
    need.ressources_affectees.forEach((n) => {
      doc.text(`• ${n}`, M + 2, y);
      y += 5;
    });
    y += 4;
  }

  if (y > 230) { doc.addPage(); y = M; }
  y += 8;
  const sigW = (PAGE_W - M * 2 - 8) / 3;
  ['Chef de projet', 'Chargée RH', 'Direction'].forEach((label, i) => {
    const x = M + i * (sigW + 4);
    doc.setDrawColor(...BORDER);
    doc.rect(x, y, sigW, 22);
    setPdfFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, x + sigW / 2, y + 6, { align: 'center' });
    doc.line(x + 4, y + 18, x + sigW - 4, y + 18);
  });

  doc.save(`besoin-rh-${(need.ref_besoin || 'BR').replace(/\s/g, '-')}.pdf`);
}
