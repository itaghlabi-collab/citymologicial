/**
 * leaveRequestPdf.js — PDF demande de congé (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';

const LOGO_URL = 'https://i.ibb.co/Ldm3WWdK/Capture-d-e-cran-2026-05-26-a-12-16-21.png';

const RED = [183, 28, 28];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];
const ROW_GRAY = [245, 245, 245];

const COMPANY_LINES = [
  '228 Bd Mohammed V, Casablanca 20000',
  'Tél : +212 52 231 0043',
  'contact@citymo.ma',
  'Capital de 200000 MAD RC: 401959',
  'Patente: 32173075',
  'IF: 25080805 - ICE: 002023116000060',
];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const LOGO_MAX_W = 48;
const LOGO_MAX_H = 15;

function dash(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(raw + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function loadImageAspect(dataUrl, fallback = 2.75) {
  if (!dataUrl) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(img.naturalHeight, 1));
    img.onerror = () => resolve(fallback);
    img.src = dataUrl;
  });
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch(LOGO_URL, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormat(dataUrl) {
  if (!dataUrl) return 'JPEG';
  if (dataUrl.includes('image/png')) return 'PNG';
  return 'JPEG';
}

function fitInBox(maxW, maxH, ratio) {
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

function drawLogoPlain(doc, logoData, x, y, maxW, maxH, ratio) {
  if (!logoData) return { w: 0, h: 0 };
  try {
    const fit = fitInBox(maxW, maxH, ratio);
    doc.addImage(logoData, imageFormat(logoData), x, y, fit.w, fit.h);
    return fit;
  } catch {
    return { w: 0, h: 0 };
  }
}

function drawWatermark(doc, logoData, logoRatio) {
  if (!logoData) return;
  try {
    const fit = fitInBox(80, 26, logoRatio);
    const x = (PAGE_W - fit.w) / 2;
    const y = (PAGE_H - fit.h) / 2;
    if (typeof doc.saveGraphicsState === 'function' && typeof doc.GState === 'function') {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.04 }));
      doc.addImage(logoData, imageFormat(logoData), x, y, fit.w, fit.h);
      doc.restoreGraphicsState();
    }
  } catch { /* optionnel */ }
}

function drawSectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  return y + 8;
}

function drawTable(doc, rows, startY) {
  const col1W = CONTENT_W * 0.38;
  const col2W = CONTENT_W - col1W;
  let y = startY;

  rows.forEach(([label, value]) => {
    const val = dash(value);
    doc.setFontSize(9);
    const valueLines = val === '—' ? ['—'] : doc.splitTextToSize(val, col2W - 6);
    const rowH = Math.max(7, valueLines.length * 4 + 3);

    doc.setFillColor(...ROW_GRAY);
    doc.rect(MARGIN, y, col1W, rowH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN + col1W, y, col2W, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_W, rowH);
    doc.line(MARGIN + col1W, y, MARGIN + col1W, y + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, MARGIN + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(valueLines, MARGIN + col1W + 3, y + 5);

    y += rowH;
  });

  return y + 4;
}

function drawValidationZone(doc, y) {
  y = drawSectionTitle(doc, 'VALIDATION', y + 2);

  const boxW = (CONTENT_W - 12) / 3;
  const boxH = 28;
  const labels = ['Signature salarié', 'Validation RH', 'Direction'];

  labels.forEach((label, i) => {
    const x = MARGIN + i * (boxW + 6);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(x, y, boxW, boxH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label, x + boxW / 2, y + boxH + 5, { align: 'center' });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Date : _______________', x + boxW / 2, y + boxH + 10, { align: 'center' });
  });

  return y + boxH + 16;
}

function resolveEmployee(leave, employee) {
  const emp = employee || leave?.employees || {};
  const prenom = emp.firstname || '';
  const nom = emp.lastname || '';
  const full = [prenom, nom].filter(Boolean).join(' ').trim();
  return {
    prenom: dash(prenom || (full ? full.split(' ')[0] : '')),
    nom: dash(nom || (full ? full.split(' ').slice(1).join(' ') : leave?.employe)),
    poste: dash(emp.poste),
    departement: dash(emp.department),
  };
}

export function leavePdfFilename(leave, employee) {
  const emp = employee || leave?.employees || {};
  const nom = (emp.lastname || leave?.employe || 'employe')
    .toString()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ-]/gi, '')
    .slice(0, 40) || 'employe';
  const date = (leave?.dateDebut || leave?.date_debut || '')
    .toString()
    .slice(0, 10)
    || (leave?.created_at ? new Date(leave.created_at).toISOString().slice(0, 10) : 'date');
  return `demande-conge-${nom}-${date}.pdf`;
}

/**
 * Génère et télécharge le PDF d'une demande de congé.
 * @param {object} leave — ligne congé normalisée
 * @param {object} [employee] — employé RH (optionnel)
 */
export async function generateLeaveRequestPdf(leave, employee = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logoData = await loadLogoDataUrl();
  const logoRatio = await loadImageAspect(logoData, 2.75);

  drawWatermark(doc, logoData, logoRatio);

  let y = MARGIN;
  const logoFit = drawLogoPlain(doc, logoData, MARGIN, y, LOGO_MAX_W, LOGO_MAX_H, logoRatio);
  y += (logoFit.h || 12) + 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  COMPANY_LINES.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 3.6;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...TEXT);
  doc.text('DEMANDE DE CONGÉ', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.6);
  doc.line(MARGIN + 24, y, PAGE_W - MARGIN - 24, y);
  y += 10;

  const empInfo = resolveEmployee(leave, employee);
  const statut = leave._statut || leave.statut || 'En attente';

  y = drawSectionTitle(doc, 'INFORMATIONS SALARIÉ', y);
  y = drawTable(doc, [
    ['Nom', empInfo.nom],
    ['Prénom', empInfo.prenom],
    ['Poste', empInfo.poste],
    ['Département', empInfo.departement],
  ], y);

  y = drawSectionTitle(doc, 'DÉTAILS DU CONGÉ', y);
  y = drawTable(doc, [
    ['Type de congé', leave.type],
    ['Date de début', fmtDate(leave.dateDebut || leave.date_debut)],
    ['Date de fin', fmtDate(leave.dateFin || leave.date_fin)],
    ['Date de retour', fmtDate(leave.dateRetour || leave.date_retour)],
    ['Nombre de jours', leave.jours != null ? String(leave.jours) : '—'],
    ['Motif', leave.raison],
    ['Statut', statut],
    ['Date de demande', fmtDateTime(leave.created_at)],
  ], y);

  const { leaveTypeLabelForPdf } = await import('./leaveBalance');
  const typePhrase = leaveTypeLabelForPdf(leave.type);
  const joursAccordes = leave.snap_jours_accordes != null ? leave.snap_jours_accordes : leave.jours;
  const reliquatNouveau = leave.snap_reliquat_nouveau;

  y = drawSectionTitle(doc, 'DROITS DE CONGÉ', y);
  const civilite = 'M./Mme';
  const nomComplet = [empInfo.prenom, empInfo.nom].filter(Boolean).join(' ') || leave.employe || '—';
  y = drawTable(doc, [
    ['Décision', `Vu à ses droits de congé, il est accordé à ${civilite} ${nomComplet}`],
    ['Nature', `Au titre d'un ${typePhrase} de : ${joursAccordes != null ? joursAccordes : '—'} jours`],
    ['Période', `Allant du ${fmtDate(leave.dateDebut || leave.date_debut)} au ${fmtDate(leave.dateFin || leave.date_fin)}`],
    ['Date de retour', fmtDate(leave.dateRetour || leave.date_retour)],
    ['Reliquat à nouveau', reliquatNouveau != null ? `${reliquatNouveau} jours` : '—'],
  ], y);

  if (leave.balance_snapshot_at || leave.snap_solde_disponible != null) {
    y = drawSectionTitle(doc, 'CALCUL DES DROITS', y);
    y = drawTable(doc, [
      ['Jours travaillés', leave.snap_jours_travailles != null ? String(leave.snap_jours_travailles) : '—'],
      ['Jours fériés', leave.snap_jours_feries != null ? String(leave.snap_jours_feries) : '—'],
      ['Reliquat ancien', leave.snap_reliquat_ancien != null ? String(leave.snap_reliquat_ancien) : '—'],
      ['Droit au congé', leave.snap_droit_acquis != null ? String(leave.snap_droit_acquis) : '—'],
      ['Jours déjà consommés', leave.snap_jours_consommes != null ? String(leave.snap_jours_consommes) : '—'],
      ['Solde avant demande', leave.snap_solde_disponible != null ? String(leave.snap_solde_disponible) : '—'],
      ['Jours accordés', joursAccordes != null ? String(joursAccordes) : '—'],
      ['Reliquat à nouveau', reliquatNouveau != null ? String(reliquatNouveau) : '—'],
      ['Règle de calcul', leave.snap_regle_calcul || '—'],
      ['Détail jours fériés', leave.snap_feries_detail || '—'],
    ], y);
  }

  drawValidationZone(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO', PAGE_W / 2, PAGE_H - 10, { align: 'center' });

  const filename = leavePdfFilename(leave, employee);
  downloadPdfBlob(doc.output('blob'), filename);
}

function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
