/**
 * projectPdf.js — Récapitulatif projet PDF (A4 CITYMO)
 */
import { jsPDF } from 'jspdf';
import { TYPE_PROJET_LABEL } from '../../constants/commercial';
import { statutApresInterventionLabel } from '../../constants/sav';
import { listSavRequestsByProjectId } from './savRequests';
import { listSavReportsByProjectId } from './savReports';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const ICON_URL = 'https://i.ibb.co/S79nbLdm/icone.png';

const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const PAGE_W = 210;
const PAGE_H = 297;
const M = 12;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_H = 22;
const MAX_Y = PAGE_H - FOOTER_H;

const COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000',
  phone: 'Tél : +212 52 231 0043',
  email: 'contact@citymo.ma',
  legal: 'Capital de 200000 MAD RC: 401959',
  fiscal: 'IF: 25080805 - ICE: 002023116000060',
};

const STATUT_PROJET = {
  brouillon: 'Brouillon', en_cours: 'En cours', en_pause: 'En pause',
  termine: 'Terminé', annule: 'Annulé',
};

async function loadImageWithSize(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    const size = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 1, height: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, ...size };
  } catch {
    return null;
  }
}

function containImage(nw, nh, maxW, maxH) {
  if (!nw || !nh) return { width: maxW, height: maxH };
  const r = nw / nh;
  let w = maxW;
  let h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  return { width: w, height: h };
}

function imgFmt(url) {
  return url?.includes('jpeg') || url?.includes('jpg') ? 'JPEG' : 'PNG';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtMad(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR') + ' MAD';
}

export async function generateProjectRecapPdf(projet) {
  const [logoMeta, iconMeta, savList, crList] = await Promise.all([
    loadImageWithSize(LOGO_URL),
    loadImageWithSize(ICON_URL),
    projet.id ? listSavRequestsByProjectId(projet.id).catch(() => []) : Promise.resolve([]),
    projet.id ? listSavReportsByProjectId(projet.id, 8).catch(() => []) : Promise.resolve([]),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;

  const drawWatermark = () => {
    if (!iconMeta?.dataUrl) return;
    try {
      const size = containImage(iconMeta.width, iconMeta.height, PAGE_W - 16, PAGE_H - 40);
      const ix = PAGE_W / 2 - size.width / 2;
      const iy = (PAGE_H - 40) / 2 - size.height / 2;
      if (doc.saveGraphicsState && doc.GState) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.07 }));
        doc.addImage(iconMeta.dataUrl, imgFmt(iconMeta.dataUrl), ix, iy, size.width, size.height);
        doc.restoreGraphicsState();
      }
    } catch { /* skip */ }
  };

  const drawFooter = (p, total) => {
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.6);
    doc.line(M, PAGE_H - FOOTER_H + 4, PAGE_W - M, PAGE_H - FOOTER_H + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(`Page ${p}/${total}`, PAGE_W / 2, PAGE_H - 6, { align: 'center' });
  };

  const ensureSpace = (h) => {
    if (y + h > MAX_Y) {
      doc.addPage();
      y = M + 4;
    }
  };

  const sectionTitle = (title) => {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text(title.toUpperCase(), M, y);
    y += 4;
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.4);
    doc.line(M, y, PAGE_W - M, y);
    y += 6;
  };

  const fieldLine = (label, value) => {
    ensureSpace(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(`${label} :`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(String(value || '—'), CONTENT_W - 38);
    lines.forEach((line, i) => {
      doc.text(line, M + 36, y + i * 3.8);
    });
    y += Math.max(lines.length * 3.8, 5);
  };

  if (logoMeta?.dataUrl) {
    const ls = containImage(logoMeta.width, logoMeta.height, 42, 20);
    try {
      doc.addImage(logoMeta.dataUrl, imgFmt(logoMeta.dataUrl), M, y, ls.width, ls.height);
    } catch { /* skip */ }
    y += ls.height + 2;
  }
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  [COMPANY.address, COMPANY.phone, COMPANY.email, COMPANY.legal, COMPANY.fiscal].forEach((line) => {
    doc.text(line, M, y);
    y += 3;
  });
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text('RÉCAPITULATIF PROJET', M, y);
  y += 8;

  sectionTitle('Projet');
  fieldLine('Référence', projet.ref);
  fieldLine('Nom', projet.nom);
  fieldLine('Client', projet.client || projet.client_nom);
  fieldLine('Type', TYPE_PROJET_LABEL[projet.type_projet] || projet.type_projet);
  fieldLine('Chef de projet', projet.chef_projet || projet.responsable);
  fieldLine('Budget approuvé', fmtMad(projet.budget_approuve));
  fieldLine('Budget consommé', fmtMad(projet.budget_consomme));
  fieldLine('Avancement', `${projet.avancement || 0} %`);
  fieldLine('Date début', fmtDate(projet.date_debut));
  fieldLine('Fin prévue', fmtDate(projet.date_fin_prevue));
  fieldLine('Statut', STATUT_PROJET[projet.statut] || projet.statut);

  if (projet.description?.trim()) {
    sectionTitle('Description');
    ensureSpace(8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.splitTextToSize(projet.description.trim(), CONTENT_W).forEach((line) => {
      ensureSpace(4);
      doc.text(line, M, y);
      y += 3.5;
    });
    y += 4;
  }

  if (projet.observations?.trim()) {
    sectionTitle('Observations');
    ensureSpace(8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.splitTextToSize(projet.observations.trim(), CONTENT_W).forEach((line) => {
      ensureSpace(4);
      doc.text(line, M, y);
      y += 3.5;
    });
    y += 4;
  }

  sectionTitle('Demandes SAV liées');
  if (!savList.length) {
    fieldLine('—', 'Aucune demande SAV');
  } else {
    savList.slice(0, 12).forEach((s, i) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT);
      doc.text(`${i + 1}. ${s.ref} — ${s.titre || s.type_sav || 'SAV'}`, M, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(`Statut: ${s.statut_label || s.statut} | Priorité: ${s.priorite} | Date: ${fmtDate(s.date_demande)}`, M + 2, y);
      y += 3.5;
      if (s.description) {
        const dl = doc.splitTextToSize(s.description.slice(0, 200), CONTENT_W - 4);
        dl.forEach((line) => { doc.text(line, M + 2, y); y += 3.2; });
      }
      y += 2;
    });
  }

  sectionTitle('Derniers comptes rendus SAV');
  if (!crList.length) {
    fieldLine('—', 'Aucun compte rendu');
  } else {
    crList.forEach((c, i) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT);
      const statutInterv = statutApresInterventionLabel(c.statut_apres_intervention);
      doc.text(`${i + 1}. ${c.ref} — ${fmtDate(c.date_compte_rendu)} — ${c.intervenant || '—'}`, M, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(`Statut après interv. : ${statutInterv}`, M + 2, y);
      y += 3.5;
      if (c.resume_intervention) {
        doc.splitTextToSize(c.resume_intervention.slice(0, 180), CONTENT_W - 2).forEach((line) => {
          doc.text(line, M + 2, y);
          y += 3.2;
        });
      }
      y += 2;
    });
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawWatermark();
    drawFooter(p, total);
  }

  const safe = (projet.ref || projet.nom || 'projet').replace(/[^\w-]+/g, '_');
  doc.save(`Recap_projet_${safe}.pdf`);
}
