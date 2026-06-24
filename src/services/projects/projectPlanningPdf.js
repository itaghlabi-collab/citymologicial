/**
 * projectPlanningPdf.js — Export PDF planning chantier (Gantt simplifié)
 */
import { jsPDF } from 'jspdf';
import { planningStatutMeta, planningLotColor } from '../../constants/projectPlanning';

const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [120, 120, 120];
const PAGE_W = 210;
const PAGE_H = 297;
const M = 12;
const MAX_Y = PAGE_H - 18;

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function ensureSpace(doc, y, need = 10) {
  if (y + need > MAX_Y) {
    doc.addPage();
    return M + 4;
  }
  return y;
}

export async function generateProjectPlanningPdf(projet, tasks = []) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...RED);
  doc.text('CITYMO — Planning chantier', M, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.text(projet.nom || 'Projet', M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Réf. ${projet.ref || '—'}  |  Export ${new Date().toLocaleDateString('fr-FR')}`, M, y);
  y += 8;

  if (!tasks.length) {
    doc.setTextColor(...MUTED);
    doc.text('Aucune tâche planning enregistrée.', M, y);
    doc.save(`planning-${projet.ref || projet.id || 'projet'}.pdf`);
    return;
  }

  const cols = [
    { w: 48, label: 'Tâche' },
    { w: 22, label: 'Lot' },
    { w: 20, label: 'Début' },
    { w: 20, label: 'Fin' },
    { w: 14, label: '%' },
    { w: 22, label: 'Statut' },
    { w: 38, label: 'Responsable' },
  ];

  function drawHeader() {
    let x = M;
    doc.setFillColor(245, 245, 245);
    doc.rect(M, y - 4, PAGE_W - M * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    cols.forEach((c) => {
      doc.text(c.label, x + 1, y);
      x += c.w;
    });
    y += 6;
  }

  drawHeader();

  tasks.forEach((t, idx) => {
    y = ensureSpace(doc, y, 12);
    if (idx > 0 && y === M + 4) drawHeader();

    let x = M;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);

    const statut = planningStatutMeta(t.statut);
    const lines = [
      doc.splitTextToSize(t.nom || '—', cols[0].w - 2),
      doc.splitTextToSize(t.lot || '—', cols[1].w - 2),
      [fmtDate(t.date_debut)],
      [fmtDate(t.date_fin)],
      [`${Math.round(t.avancement)}%`],
      [statut.label],
      doc.splitTextToSize(t.responsable || '—', cols[6].w - 2),
    ];

    const rowH = Math.max(...lines.map((l) => (Array.isArray(l) ? l.length : 1) * 3.5), 5);
    lines.forEach((line, i) => {
      const arr = Array.isArray(line) ? line : [line];
      doc.text(arr, x + 1, y);
      x += cols[i].w;
    });

    const barX = M;
    const barW = PAGE_W - M * 2;
    const barY = y + rowH * 0.3;
    doc.setDrawColor(220, 220, 220);
    doc.rect(barX, barY, barW, 2.5);
    const pct = Math.min(100, Math.max(0, Number(t.avancement) || 0));
    const lotRgb = hexToRgb(planningLotColor(t.lot));
    doc.setFillColor(...lotRgb);
    doc.rect(barX, barY, (barW * pct) / 100, 2.5, 'F');

    y += rowH + 5;
  });

  doc.save(`planning-${projet.ref || projet.id || 'projet'}.pdf`);
}

function hexToRgb(hex) {
  const h = (hex || '#757575').replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
