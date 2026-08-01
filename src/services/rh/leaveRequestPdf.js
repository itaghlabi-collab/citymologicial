/**
 * leaveRequestPdf.js — PDF demande de congé (A4 strictement 1 page, jsPDF)
 */
import { jsPDF } from 'jspdf';
import { leaveTypeLabelForPdf } from './leaveBalance';

const LOGO_URL = 'https://i.ibb.co/Ldm3WWdK/Capture-d-e-cran-2026-05-26-a-12-16-21.png';

const RED = [183, 28, 28];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];
const ROW_GRAY = [245, 245, 245];

const COMPANY_LINES = [
  '228 Bd Mohammed V, Casablanca 20000',
  'Tél : +212 52 231 0043 · contact@citymo.ma',
  'Capital 200000 MAD · RC 401959 · Patente 32173075',
  'IF 25080805 · ICE 002023116000060',
];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 11;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 6;
const CONTENT_BOTTOM = FOOTER_Y - 3;

const LOGO_MAX_W = 38;
const LOGO_MAX_H = 12;

function displayValue(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s || '—';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR', {
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
    const fit = fitInBox(68, 22, logoRatio);
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

/** Espace vertical avant un titre de section (évite le chevauchement avec le bloc précédent). */
const SECTION_GAP = 5.5;

function drawSectionTitle(doc, title, y) {
  const titleY = y + SECTION_GAP;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...RED);
  doc.text(title, MARGIN, titleY);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.28);
  doc.line(MARGIN, titleY + 1.2, PAGE_W - MARGIN, titleY + 1.2);
  return titleY + 5;
}

function drawTable(doc, rows, startY, { fontSize = 7.5, padY = 3.4, lineH = 2.9 } = {}) {
  const col1W = CONTENT_W * 0.32;
  const col2W = CONTENT_W - col1W;
  let y = startY;

  rows.forEach(([label, value]) => {
    const val = displayValue(value);
    doc.setFontSize(fontSize);
    const valueLines = val === '—' ? ['—'] : doc.splitTextToSize(val, col2W - 4);
    const rowH = Math.max(padY + 0.8, valueLines.length * lineH + 1.6);

    doc.setFillColor(...ROW_GRAY);
    doc.rect(MARGIN, y, col1W, rowH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN + col1W, y, col2W, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.1);
    doc.rect(MARGIN, y, CONTENT_W, rowH);
    doc.line(MARGIN + col1W, y, MARGIN + col1W, y + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(...MUTED);
    doc.text(label, MARGIN + 2, y + padY - 0.4);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(valueLines, MARGIN + col1W + 2, y + padY - 0.4);

    y += rowH;
  });

  return y + 2;
}

function drawRoundedBox(doc, x, y, w, h) {
  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.28);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  } else {
    doc.rect(x, y, w, h, 'FD');
  }
}

function drawLabeledLines(doc, x, y, w, rows, title, rowStep = 4.6) {
  let cy = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RED);
  doc.text(title, x + w / 2, cy, { align: 'center' });
  cy += 5;

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    doc.text(label, x + 3.5, cy);
    const labelW = doc.getTextWidth(label) + 1.2;
    const val = displayValue(value);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const maxValW = w - labelW - 8;
    const lines = doc.splitTextToSize(val, maxValW);
    doc.text(lines[0] || '—', x + 3.5 + labelW, cy);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.12);
    doc.line(x + 3.5 + labelW, cy + 0.9, x + w - 3.5, cy + 0.9);
    cy += Math.max(rowStep, lines.length * 2.8 + 1.6);
  });

  return cy + 1.5;
}

/**
 * Zone signatures — jamais de 2ᵉ page : hauteur = espace restant sur la feuille.
 */
function drawValidationZone(doc, startY, leave) {
  const preferredBoxH = 22;
  const minBoxH = 15;
  let y = drawSectionTitle(doc, 'VALIDATION', startY);

  const available = CONTENT_BOTTOM - y;
  // Ne jamais remonter au-dessus du contenu : on réduit les cases si besoin
  const finalBoxH = Math.max(minBoxH, Math.min(preferredBoxH, Math.max(minBoxH, available)));
  const boxGap = 3.5;
  const boxW = (CONTENT_W - boxGap * 2) / 3;
  const statut = leave._statut || leave.statut || 'En attente';
  const dateDemande = fmtDateTime(leave.created_at);
  const dateDecision = fmtDateTime(leave.updated_at || leave.balance_snapshot_at || leave.created_at);

  const boxes = [
    {
      label: 'Signature salarié',
      line2: `Demande : ${dateDemande}`,
    },
    {
      label: 'Validation RH',
      line2: statut === 'En attente' ? 'En attente de décision' : `Statut : ${statut}`,
      line3: statut !== 'En attente' ? `Le ${dateDecision}` : null,
    },
    {
      label: 'Direction',
      line2: 'Visa / cachet',
    },
  ];

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (boxW + boxGap);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.22);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, boxW, finalBoxH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(box.label, x + boxW / 2, y + 3.5, { align: 'center' });

    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.12);
    const sigY = y + finalBoxH - (box.line3 ? 8.5 : 6.5);
    doc.line(x + 3, sigY, x + boxW - 3, sigY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...TEXT);
    doc.text(box.line2, x + boxW / 2, y + finalBoxH - (box.line3 ? 5 : 2.8), {
      align: 'center',
      maxWidth: boxW - 4,
    });
    if (box.line3) {
      doc.setTextColor(...MUTED);
      doc.text(box.line3, x + boxW / 2, y + finalBoxH - 2, { align: 'center' });
    }
  });

  return y + finalBoxH;
}

function resolveEmployee(leave, employee) {
  const emp = employee || leave?.employees || {};
  const prenom = emp.firstname || '';
  const nom = emp.lastname || '';
  const full = [prenom, nom].filter(Boolean).join(' ').trim()
    || (leave?.employe_label || leave?.employe || '');
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    prenom: displayValue(prenom || (parts[0] || '')),
    nom: displayValue(nom || (parts.length > 1 ? parts.slice(1).join(' ') : '')),
    poste: displayValue(emp.poste || leave?.poste),
    departement: displayValue(emp.department || leave?.department),
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
 * Génère et télécharge le PDF d'une demande de congé (toujours exactement 1 page A4).
 * @param {object} leave — ligne congé normalisée
 * @param {object} [employee] — employé RH (optionnel)
 */
export async function generateLeaveRequestPdf(leave, employee = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logoData = await loadLogoDataUrl();
  const logoRatio = await loadImageAspect(logoData, 2.75);

  drawWatermark(doc, logoData, logoRatio);

  // ── En-tête aéré : logo + société, puis titre ──
  let y = MARGIN;
  const logoFit = drawLogoPlain(doc, logoData, MARGIN, y, LOGO_MAX_W, LOGO_MAX_H, logoRatio);
  const companyX = MARGIN + Math.max(logoFit.w, 32) + 6;
  let companyY = y + 1.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  COMPANY_LINES.forEach((line) => {
    doc.text(line, companyX, companyY);
    companyY += 3;
  });
  // Air entre bloc logo/adresse et le titre
  y = Math.max(y + (logoFit.h || 10), companyY) + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text('DEMANDE DE CONGÉ', PAGE_W / 2, y, { align: 'center' });
  // Air entre titre et trait rouge
  y += 4;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.45);
  doc.line(MARGIN + 30, y, PAGE_W - MARGIN - 30, y);
  // Air entre trait rouge et les cadres Identification / Calcul des droits
  y += 7;

  const empInfo = resolveEmployee(leave, employee);
  const statut = leave._statut || leave.statut || 'En attente';
  const joursAccordes = leave.snap_jours_accordes != null ? leave.snap_jours_accordes : leave.jours;
  const reliquatNouveau = leave.snap_reliquat_nouveau;

  const gap = 4;
  const boxW = (CONTENT_W - gap) / 2;
  const idRows = [
    ['NOM :', empInfo.nom],
    ['PRÉNOM :', empInfo.prenom],
    ['FONCTION :', empInfo.poste],
    ['DÉPARTEMENT :', empInfo.departement],
  ];
  const rightsRows = [
    ['JOURS TRAVAILLÉS :', leave.snap_jours_travailles],
    ['JOURS FÉRIÉS :', leave.snap_jours_feries],
    ['RELIQUAT ANCIEN :', leave.snap_reliquat_ancien],
    ['DROIT AU CONGÉ :', leave.snap_droit_acquis],
    ['JOURS CONSOMMÉS :', leave.snap_jours_consommes],
    ['SOLDE DISPONIBLE :', leave.snap_solde_disponible],
    ['JOURS ACCORDÉS :', joursAccordes],
    ['RELIQUAT À NOUVEAU :', reliquatNouveau],
  ];

  const rowStep = 5;
  const measureBoxH = (rows) => 5 + 5 + rows.length * rowStep + 3;
  const boxH = Math.max(measureBoxH(idRows), measureBoxH(rightsRows));

  drawRoundedBox(doc, MARGIN, y, boxW, boxH);
  drawLabeledLines(doc, MARGIN, y, boxW, idRows, "IDENTIFICATION DE L'EMPLOYÉ(E)", rowStep);

  drawRoundedBox(doc, MARGIN + boxW + gap, y, boxW, boxH);
  drawLabeledLines(doc, MARGIN + boxW + gap, y, boxW, rightsRows, 'CALCUL DES DROITS', rowStep);

  y += boxH + 5;

  // Réserver VALIDATION (titre + gap + cases) — ne jamais dessiner par-dessus le contenu
  const SIGNATURE_RESERVE = 34;
  const detailsBudget = Math.max(36, CONTENT_BOTTOM - SIGNATURE_RESERVE - y);

  // Densité tables adaptée à l’espace restant (détails + droits ≈ 13 lignes)
  let tableOpts;
  if (detailsBudget < 78) {
    tableOpts = { fontSize: 6.5, padY: 2.6, lineH: 2.4 };
  } else if (detailsBudget < 100) {
    tableOpts = { fontSize: 7, padY: 2.9, lineH: 2.6 };
  } else {
    tableOpts = { fontSize: 7.5, padY: 3.2, lineH: 2.8 };
  }

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
  ], y, tableOpts);

  const typePhrase = leaveTypeLabelForPdf(leave.type);
  const civilite = 'M./Mme';
  const nomComplet = [empInfo.prenom, empInfo.nom].filter((x) => x && x !== '—').join(' ')
    || leave.employe
    || leave.employe_label
    || '—';

  y = drawSectionTitle(doc, 'DROITS DE CONGÉ', y);
  y = drawTable(doc, [
    ['Décision', `Vu à ses droits de congé, il est accordé à ${civilite} ${nomComplet}`],
    ['Nature', `Au titre d'un ${typePhrase} de : ${joursAccordes != null ? joursAccordes : '—'} jours`],
    ['Période', `Allant du ${fmtDate(leave.dateDebut || leave.date_debut)} au ${fmtDate(leave.dateFin || leave.date_fin)}`],
    ['Date de retour', fmtDate(leave.dateRetour || leave.date_retour)],
    ['Reliquat à nouveau', reliquatNouveau != null ? `${reliquatNouveau} jours` : '—'],
  ], y, tableOpts);

  // Toujours sur la même page — jamais doc.addPage() ni remonter y (cause du chevauchement)
  drawValidationZone(doc, y, leave);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO', PAGE_W / 2, FOOTER_Y, { align: 'center' });

  // Sécurité : une seule page A4
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }

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
