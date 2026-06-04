/**
 * savReportPdf.js — PDF compte rendu SAV (A4 CITYMO)
 */
import { jsPDF } from 'jspdf';
import { statutApresInterventionLabel } from '../../constants/sav';
import { getSavRequestById } from './savRequests';

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

const STATUT_CR_LABEL = {
  brouillon: 'Brouillon',
  soumis: 'Soumis',
  valide: 'Validé',
  refuse: 'Refusé',
};

const STATUT_SAV_LABEL = {
  nouvelle: 'Nouvelle demande',
  en_attente: 'En attente',
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  cloturee: 'Clôturée',
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
  return (Number(n) || 0).toLocaleString('fr-FR') + ' MAD';
}

function blockText(doc, text, x, maxW, startY, ensureSpace, lineH = 3.5) {
  let y = startY;
  if (!text?.trim()) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.splitTextToSize(text.trim(), maxW).forEach((line) => {
    ensureSpace(lineH);
    doc.text(line, x, y);
    y += lineH;
  });
  return y + 2;
}

export async function generateSavReportPdf(cr) {
  const sav = cr.sav_request_id
    ? await getSavRequestById(cr.sav_request_id).catch(() => null)
    : null;

  const [logoMeta, iconMeta] = await Promise.all([
    loadImageWithSize(LOGO_URL),
    loadImageWithSize(ICON_URL),
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
  doc.text('COMPTE RENDU SAV', M, y);
  y += 8;

  sectionTitle('Compte rendu');
  fieldLine('Référence', cr.ref);
  fieldLine('Date compte rendu', fmtDate(cr.date_compte_rendu || cr.date_intervention));
  fieldLine('Intervenant', cr.intervenant);
  fieldLine('Client', cr.client || cr.client_nom);
  fieldLine('Projet', cr.projet_lie || cr.projet_nom);
  fieldLine('Statut document', STATUT_CR_LABEL[cr.statut] || cr.statut);
  fieldLine('Validation client', cr.validation_client);

  if (sav) {
    sectionTitle('Demande SAV liée');
    fieldLine('Référence SAV', sav.ref);
    fieldLine('Titre', sav.titre);
    fieldLine('Type problème', sav.type_sav || sav.type_probleme);
    fieldLine('Catégorie', sav.categorie);
    fieldLine('Priorité', sav.priorite);
    fieldLine('Statut demande', STATUT_SAV_LABEL[sav.statut] || sav.statut_label || sav.statut);
    fieldLine('Date demande', fmtDate(sav.date_demande));
    fieldLine('Responsable / Technicien', sav.responsable || sav.technicien);
    fieldLine('Localisation', sav.localisation);
    fieldLine('Contact client', sav.contact_client);
    fieldLine('Date intervention prévue', fmtDate(sav.date_intervention));

    if (sav.description?.trim()) {
      sectionTitle('Description de la demande');
      y = blockText(doc, sav.description, M, CONTENT_W, y, ensureSpace);
    }
    if (sav.observations?.trim()) {
      sectionTitle('Observations demande');
      y = blockText(doc, sav.observations, M, CONTENT_W, y, ensureSpace);
    }
    if (sav.actions_prevues?.trim()) {
      sectionTitle('Actions prévues (demande)');
      y = blockText(doc, sav.actions_prevues, M, CONTENT_W, y, ensureSpace);
    }
  } else if (cr.sav_lie || cr.sav_ref) {
    sectionTitle('Demande SAV liée');
    fieldLine('Référence SAV', cr.sav_lie || cr.sav_ref);
  }

  sectionTitle('Intervention réalisée');
  fieldLine('Statut après intervention', statutApresInterventionLabel(cr.statut_apres_intervention));
  fieldLine('Coût intervention', fmtMad(cr.cout_intervention));

  if (cr.resume_intervention?.trim()) {
    sectionTitle('Résumé intervention');
    y = blockText(doc, cr.resume_intervention, M, CONTENT_W, y, ensureSpace);
  }
  if (cr.actions_realisees?.trim()) {
    sectionTitle('Actions réalisées');
    y = blockText(doc, cr.actions_realisees, M, CONTENT_W, y, ensureSpace);
  }
  if (cr.actions_a_prevoir?.trim()) {
    sectionTitle('Actions à prévoir');
    y = blockText(doc, cr.actions_a_prevoir, M, CONTENT_W, y, ensureSpace);
  }
  if (cr.pieces_remplacees?.trim()) {
    sectionTitle('Pièces / matériaux');
    y = blockText(doc, cr.pieces_remplacees, M, CONTENT_W, y, ensureSpace);
  }
  if (cr.recommandations?.trim()) {
    sectionTitle('Recommandations');
    y = blockText(doc, cr.recommandations, M, CONTENT_W, y, ensureSpace);
  }
  if (cr.observation?.trim()) {
    sectionTitle('Observations compte rendu');
    y = blockText(doc, cr.observation, M, CONTENT_W, y, ensureSpace);
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawWatermark();
    drawFooter(p, total);
  }

  const safe = (cr.ref || 'compte_rendu').replace(/[^\w-]+/g, '_');
  doc.save(`CR_SAV_${safe}.pdf`);
}
