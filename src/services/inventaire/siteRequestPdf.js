/**
 * siteRequestPdf.js — PDF Bon de demande chantier CITYMO (A4)
 */
import { jsPDF } from 'jspdf';
import { loadCompanyLogoFit } from '../finance/pdfShared';
import { SITE_REQUEST_CATEGORIES, siteRequestStatutLabel } from '../../constants/siteMaterialRequests';

const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];
const HEADER_BG = [248, 248, 248];
const M = 12;
const PAGE_W = 210;
const FOOTER_Y = 287;

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR');
  } catch {
    return '—';
  }
}

export async function generateSiteRequestPdf(request) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadCompanyLogoFit(42, 18);
  let y = M;

  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, 'PNG', M, y, logo.w, logo.h);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text('BON DE DEMANDE CHANTIER', PAGE_W - M, y + 6, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(request.ref || '', PAGE_W - M, y + 12, { align: 'right' });

  y += Math.max(logo?.h || 14, 16) + 6;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  const info = [
    ['Référence', request.ref || '—'],
    ['Projet', request.project_name || '—'],
    ['Client', request.client_name || '—'],
    ['Chef de projet', request.chef_projet || '—'],
    ['Chef de chantier', request.chef_chantier || '—'],
    ['Date demande', fmtDate(request.date_demande)],
    ['Date souhaitée', fmtDate(request.date_souhaitee)],
    ['Priorité', request.priorite || '—'],
    ['Statut', siteRequestStatutLabel(request.statut)],
  ];

  doc.setFontSize(8);
  const colW = (PAGE_W - M * 2) / 2;
  info.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * colW;
    const iy = y + row * 11;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, x, iy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT);
    doc.text(String(value).slice(0, 48), x + 32, iy);
  });
  y += Math.ceil(info.length / 2) * 11 + 6;

  const activeLines = (request.lines || []).filter((l) => Number(l.quantite_demandee) > 0);

  SITE_REQUEST_CATEGORIES.forEach((cat) => {
    const catLines = activeLines.filter((l) => l.category_id === cat.id);
    if (!catLines.length) return;

    if (y > FOOTER_Y - 40) {
      doc.addPage();
      y = M;
    }

    doc.setFillColor(...HEADER_BG);
    doc.rect(M, y, PAGE_W - M * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text(`${cat.icon} ${cat.label}`, M + 2, y + 5);
    y += 9;

    const cols = [M, M + 62, M + 82, M + 102, M + 122, M + 152];
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    ['Article', 'Demandé', 'Préparé', 'Livré', 'Obs.'].forEach((h, i) => {
      doc.text(h, cols[i] + 1, y);
    });
    y += 4;
    doc.setDrawColor(...BORDER);
    doc.line(M, y, PAGE_W - M, y);
    y += 4;

    catLines.forEach((line) => {
      if (y > FOOTER_Y - 12) {
        doc.addPage();
        y = M;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT);
      const nameLines = doc.splitTextToSize(line.article_name, 58);
      doc.text(nameLines[0], cols[0] + 1, y);
      doc.text(String(line.quantite_demandee || 0), cols[1] + 1, y);
      doc.text(String(line.quantite_preparee || 0), cols[2] + 1, y);
      doc.text(String(line.quantite_livree || 0), cols[3] + 1, y);
      const obs = line.remarque_magasinier || line.remarque || '';
      doc.text(doc.splitTextToSize(obs, 38)[0] || '—', cols[4] + 1, y);
      y += nameLines.length > 1 ? 8 : 5;
    });
    y += 4;
  });

  if (request.observation) {
    if (y > FOOTER_Y - 20) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text('Observation générale', M, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const obsLines = doc.splitTextToSize(request.observation, PAGE_W - M * 2);
    obsLines.forEach((line) => { doc.text(line, M, y); y += 4; });
    y += 4;
  }

  if (request.history?.length) {
    if (y > FOOTER_Y - 30) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Historique des validations', M, y);
    y += 6;
    doc.setFontSize(7);
    request.history.forEach((h) => {
      if (y > FOOTER_Y - 8) { doc.addPage(); y = M; }
      doc.setTextColor(...TEXT);
      doc.text(`${h.action} — ${h.actor_name || '—'} — ${fmtDateTime(h.created_at)}`, M, y);
      y += 4;
    });
    y += 6;
  }

  if (y > FOOTER_Y - 35) { doc.addPage(); y = M; }
  y += 4;
  doc.setDrawColor(...BORDER);
  const sigY = y + 18;
  const sigW = (PAGE_W - M * 2 - 12) / 4;
  ['Chef de chantier', 'Chef de projet', 'Magasinier', 'Validation DG'].forEach((label, i) => {
    const x = M + i * (sigW + 4);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, x + sigW / 2, y, { align: 'center' });
    doc.line(x + 2, sigY, x + sigW - 2, sigY);
  });

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CITYMO — Document officiel de demande / sortie matériel chantier', M, FOOTER_Y);
  doc.text(`Page 1`, PAGE_W - M, FOOTER_Y, { align: 'right' });

  doc.save(`demande-chantier-${(request.ref || 'DC').replace(/\s/g, '-')}.pdf`);
}
