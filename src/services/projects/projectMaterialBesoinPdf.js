/**
 * projectMaterialBesoinPdf.js — PDF fiche besoin matériaux chantier
 */
import { jsPDF } from 'jspdf';
import { setupPdfUnicodeFont, setPdfFont } from '../finance/pdfUnicode';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { materialBesoinStatutLabel } from '../../constants/projectMaterialBesoins';

const M = 12;
const PAGE_W = 210;
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [180, 180, 180];
const HEADER_BG = [245, 245, 245];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return String(v).replace('.', ',');
}

export async function generateMaterialBesoinPdf(item, projet = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await setupPdfUnicodeFont(doc);
  const logo = await loadCompanyLogoFit(44, 18);

  let y = M;
  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, 'PNG', M, y, logo.w || logo.width, logo.h || logo.height);
  }

  setPdfFont(doc, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...RED);
  doc.text('FICHE DE BESOIN MATÉRIAUX CHANTIER', PAGE_W - M, y + 8, { align: 'right' });
  y += 22;

  doc.setDrawColor(...RED);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  const rows = [
    ['Référence', item.ref_besoin || '—'],
    ['Projet', projet.nom || item.project_name || '—'],
    ['Client', projet.client || item.client_name || '—'],
    ['Demandeur', item.demandeur_name || '—'],
    ['Date du besoin', fmtDate(item.date_besoin)],
    ['Priorité', item.priorite || '—'],
    ['Statut', materialBesoinStatutLabel(item.statut)],
    ['Lot principal', item.lot_label || '—'],
    ['Nombre de lignes', String(item.line_count || item.lines?.length || 0)],
    ['Quantité globale', fmtQty(item.quantite_globale)],
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
  setPdfFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('MATÉRIAUX DEMANDÉS', M, y);
  y += 6;

  const cols = [
    { key: 'designation', label: 'Désignation', w: 52 },
    { key: 'quantite', label: 'Qté', w: 16 },
    { key: 'unite', label: 'Unité', w: 18 },
    { key: 'lot', label: 'Lot', w: 28 },
    { key: 'date', label: 'Date souh.', w: 22 },
    { key: 'obs', label: 'Observation', w: 44 },
  ];

  const tableW = cols.reduce((s, c) => s + c.w, 0);
  let x = M;

  doc.setFillColor(...HEADER_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(M, y, tableW, 7, 'FD');
  setPdfFont(doc, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT);
  cols.forEach((c) => {
    doc.text(c.label, x + 1.5, y + 4.8);
    x += c.w;
  });
  y += 7;

  const lines = item.lines || [];
  setPdfFont(doc, 'normal');
  lines.forEach((line) => {
    if (y > 255) {
      doc.addPage();
      y = M;
    }
    x = M;
    const rowH = 8;
    doc.setDrawColor(...BORDER);
    doc.rect(M, y, tableW, rowH);
    const values = [
      line.designation || '—',
      fmtQty(line.quantite),
      line.unite || '—',
      line.lot || '—',
      fmtDate(line.date_souhaitee),
      line.observation || '—',
    ];
    values.forEach((val, i) => {
      const clipped = doc.splitTextToSize(String(val), cols[i].w - 3);
      doc.text(clipped[0] || '—', x + 1.5, y + 5.2);
      x += cols[i].w;
    });
    y += rowH;
  });

  if (!lines.length) {
    doc.rect(M, y, tableW, 8);
    doc.text('Aucune ligne', M + 2, y + 5.5);
    y += 8;
  }

  y += 8;
  if (item.observation?.trim()) {
    if (y > 250) { doc.addPage(); y = M; }
    setPdfFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('OBSERVATION / PRÉCISION CHANTIER', M, y);
    y += 5;
    setPdfFont(doc, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const obsLines = doc.splitTextToSize(item.observation.trim(), PAGE_W - M * 2);
    doc.text(obsLines, M, y);
    y += obsLines.length * 4.5 + 6;
  }

  if (y > 230) { doc.addPage(); y = M; }
  y += 8;
  const sigW = (PAGE_W - M * 2 - 8) / 2;
  ['Chef de projet / Chef de chantier', 'Validation direction'].forEach((label, i) => {
    const sx = M + i * (sigW + 8);
    doc.setDrawColor(...BORDER);
    doc.rect(sx, y, sigW, 24);
    setPdfFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, sx + sigW / 2, y + 6, { align: 'center' });
    doc.line(sx + 4, y + 20, sx + sigW - 4, y + 20);
  });

  doc.save(`besoin-materiaux-${(item.ref_besoin || 'BM').replace(/\s/g, '-')}.pdf`);
}
