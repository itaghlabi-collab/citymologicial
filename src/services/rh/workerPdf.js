/**
 * workerPdf.js — Fiche ouvrier PDF (A4 une page, jsPDF)
 * Template CITYMO — mise en page équilibrée
 */
import { jsPDF } from 'jspdf';
import { enrichWorkerMedia } from './workers';
import { resolveStorageUrl, isHttpUrl, isDataUrl } from './workerStorage';
import { prepareCinImageForPdf, CIN_RATIO } from './cinPdfImage';

const LOGO_URL = 'https://i.ibb.co/Ldm3WWdK/Capture-d-e-cran-2026-05-26-a-12-16-21.png';

const RED = [183, 28, 28];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];
const ROW_GRAY = [245, 245, 245];

const COMPANY = {
  name: 'CITYMO',
  address: '228 BD MOHAMMED V, CASABLANCA 20000',
  phone: '+212 52 231 0043',
  email: 'CONTACT@CITYMO.MA',
  capital: 'Capital : 200000 MAD',
  rc: 'RC : 401959',
  patente: 'Patente : 32173075',
  if: 'IF : 25080805',
  ice: 'ICE : 002023116000060',
};

const STATUT_LABELS = {
  actif: 'Actif',
  en_chantier: 'En chantier',
  disponible: 'Disponible',
  suspendu: 'Suspendu',
  archive: 'Archivé',
};

const EXPERIENCE_LABELS = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  confirme: 'Confirmé',
  expert: 'Expert',
};

const CIN_PDF_RATIO = CIN_RATIO;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 8;

const LOGO_MAX_W = 50;
const LOGO_MAX_H = 16;
const PHOTO_SIZE = 26;

const FONT_TABLE = 8;
const FONT_SECTION = 8.5;
const FONT_TITLE = 13;
const FONT_COMPANY = 6.8;
const ROW_MIN = 5.2;
const ROW_LINE = 3.4;

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtMAD(n) {
  const v = Number(n);
  if (!v && v !== 0) return '—';
  return `${v.toLocaleString('fr-MA')} MAD`;
}

function dash(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

function workerId(w) {
  if (w.badge) return w.badge;
  if (w.id) return String(w.id).slice(0, 8).toUpperCase();
  return '—';
}

function workerDisplayName(w) {
  return [w.prenom, w.nom].filter(Boolean).join(' ').trim() || '—';
}

function posteLabel(w) {
  return (w.fonction || 'OUVRIER').toUpperCase();
}

async function loadImageDataUrl(url) {
  if (!url) return null;
  if (isDataUrl(url)) return url;

  let fetchUrl = url;
  if (!isHttpUrl(url)) {
    fetchUrl = await resolveStorageUrl(url);
    if (!fetchUrl) return null;
  }

  try {
    const res = await fetch(fetchUrl, { mode: 'cors' });
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
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'JPEG';
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

function fitInBox(maxW, maxH, ratio) {
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

/** Logo en-tête : sans cadre, ratio original, fond transparent */
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

/** object-fit: contain — photo / CIN sans déformation */
function containImage(doc, dataUrl, boxX, boxY, boxW, boxH, ratio, emptyLabel = 'Non disponible') {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.22);
  doc.rect(boxX, boxY, boxW, boxH, 'FD');

  if (!dataUrl) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(emptyLabel, boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
    return;
  }

  try {
    const fit = fitInBox(boxW - 2, boxH - 2, ratio);
    const ix = boxX + (boxW - fit.w) / 2;
    const iy = boxY + (boxH - fit.h) / 2;
    doc.addImage(dataUrl, imageFormat(dataUrl), ix, iy, fit.w, fit.h);
    doc.rect(boxX, boxY, boxW, boxH);
  } catch {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Image non disponible', boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
  }
}

function drawWatermark(doc, logoData, logoRatio) {
  if (!logoData) return;
  try {
    const fit = fitInBox(88, 28, logoRatio);
    const x = (PAGE_W - fit.w) / 2;
    const y = (PAGE_H - fit.h) / 2;
    if (typeof doc.saveGraphicsState === 'function' && typeof doc.GState === 'function') {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.04 }));
      doc.addImage(logoData, imageFormat(logoData), x, y, fit.w, fit.h);
      doc.restoreGraphicsState();
    }
  } catch { /* watermark optionnel */ }
}

function drawFooter(doc) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO', PAGE_W / 2, FOOTER_Y, { align: 'center' });
}

function drawSectionTitle(doc, title, x, y, width) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION);
  doc.setTextColor(...RED);
  doc.text(title, x, y);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1.5, x + width, y + 1.5);
  return y + 5.5;
}

function measureTableRow(doc, label, value, col1W, col2W) {
  doc.setFontSize(FONT_TABLE);
  const val = dash(value);
  if (val === '—') return ROW_MIN;
  const valueLines = doc.splitTextToSize(val, col2W - 5);
  const labelLines = doc.splitTextToSize(label, col1W - 5);
  const lines = Math.max(valueLines.length, labelLines.length, 1);
  return Math.max(ROW_MIN, lines * ROW_LINE + 2.5);
}

function drawTable(doc, rows, startY, boxX, boxW) {
  const col1W = boxW * 0.36;
  const col2W = boxW - col1W;
  let y = startY;

  rows.forEach(([label, value]) => {
    const rowH = measureTableRow(doc, label, value, col1W, col2W);

    doc.setFillColor(...ROW_GRAY);
    doc.rect(boxX, y, col1W, rowH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(boxX + col1W, y, col2W, rowH, 'F');

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(boxX, y, boxW, rowH);
    doc.line(boxX + col1W, y, boxX + col1W, y + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_TABLE);
    doc.setTextColor(...MUTED);
    doc.text(label, boxX + 2.5, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    const val = dash(value);
    if (val === '—') {
      doc.text('—', boxX + col1W + 2.5, y + 4);
    } else {
      doc.text(doc.splitTextToSize(val, col2W - 5), boxX + col1W + 2.5, y + 4);
    }

    y += rowH;
  });

  return y + 2;
}

/** Contact d'urgence sur une ligne — gain de hauteur */
function drawContactBand(doc, w, y) {
  const bandH = 9;
  const third = CONTENT_W / 3;
  const cells = [
    ['Contact', w.contact_urgence],
    ['Téléphone urgence', w.tel_urgence],
    ['Relation', w.relation_urgence],
  ];

  cells.forEach(([label, value], i) => {
    const x = MARGIN + i * third;
    doc.setFillColor(...ROW_GRAY);
    doc.rect(x, y, third, bandH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(x, y, third, bandH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 2.5, y + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_TABLE);
    doc.setTextColor(...TEXT);
    doc.text(dash(value), x + 2.5, y + 7);
  });

  return y + bandH + 3;
}

/** Calcule la hauteur CIN max pour remplir l'espace jusqu'au pied de page */
function computeCinLayout(sectionTopY) {
  const labelH = 4;
  const bottomPad = 3;
  const available = FOOTER_Y - bottomPad - sectionTopY - labelH - 3;
  const cinGap = 8;
  const maxHFromWidth = (CONTENT_W - cinGap) / (2 * CIN_PDF_RATIO);
  const cinBoxH = Math.max(32, Math.min(54, available, maxHFromWidth));
  const cinBoxW = cinBoxH * CIN_PDF_RATIO;
  const cinTotalW = cinBoxW * 2 + cinGap;
  const cinStartX = MARGIN + Math.max(0, (CONTENT_W - cinTotalW) / 2);
  return {
    cinBoxH,
    cinBoxW,
    cinGap,
    cinStartX,
    versoX: cinStartX,
    rectoX: cinStartX + cinBoxW + cinGap,
    labelY: sectionTopY,
    imgY: sectionTopY + labelH,
  };
}

function drawHeader(doc, w, logoData, logoRatio, photoData) {
  const top = MARGIN;
  const photoX = PAGE_W - MARGIN - PHOTO_SIZE;
  const leftColMaxW = photoX - MARGIN - 8;

  let logoH = 0;

  if (logoData) {
    const fit = drawLogoPlain(doc, logoData, MARGIN, top, LOGO_MAX_W, LOGO_MAX_H, logoRatio);
    logoH = fit.h;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...RED);
    doc.text(COMPANY.name, MARGIN, top + 7);
    logoH = 9;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_COMPANY);
  doc.setTextColor(...MUTED);

  const companyLines = [
    COMPANY.address,
    COMPANY.phone,
    COMPANY.email,
    `${COMPANY.rc}  ·  ${COMPANY.if}  ·  ${COMPANY.ice}`,
  ];

  let companyY = top + logoH + 3;
  companyLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, leftColMaxW);
    doc.text(wrapped, MARGIN, companyY);
    companyY += wrapped.length * 3.2;
  });

  containImage(doc, photoData, photoX, top, PHOTO_SIZE, PHOTO_SIZE, 1);

  const nameBlockW = PHOTO_SIZE + 8;
  const nameBlockH = 10;
  const nameBlockX = PAGE_W - MARGIN - nameBlockW;
  const nameBlockY = top + PHOTO_SIZE + 3;

  doc.setFillColor(...RED);
  doc.roundedRect(nameBlockX, nameBlockY, nameBlockW, nameBlockH, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const nameLines = doc.splitTextToSize(workerDisplayName(w).toUpperCase(), nameBlockW - 4);
  doc.text(nameLines.slice(0, 2), nameBlockX + nameBlockW / 2, nameBlockY + 5.5, { align: 'center' });

  const headerBottom = Math.max(
    companyY,
    nameBlockY + nameBlockH,
    top + PHOTO_SIZE,
  );

  return headerBottom + 4;
}

/**
 * Génère et télécharge la fiche PDF ouvrier (1 page A4).
 */
export async function generateWorkerPdf(worker) {
  const w = await enrichWorkerMedia(worker);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const [logoData, photoData, rectoRaw, versoRaw] = await Promise.all([
    loadImageDataUrl(LOGO_URL),
    loadImageDataUrl(w.photo),
    loadImageDataUrl(w.cin_recto),
    loadImageDataUrl(w.cin_verso),
  ]);

  const logoRatio = await loadImageAspect(logoData, 2.75);

  const [rectoData, versoData] = await Promise.all([
    rectoRaw ? prepareCinImageForPdf(rectoRaw, 'recto') : null,
    versoRaw ? prepareCinImageForPdf(versoRaw, 'verso') : null,
  ]);

  drawWatermark(doc, logoData, logoRatio);

  let y = drawHeader(doc, w, logoData, logoRatio, photoData);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_TITLE);
  doc.setTextColor(...TEXT);
  doc.text(`FICHE OUVRIER — ${posteLabel(w)}`, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 10, y, PAGE_W - MARGIN - 10, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Généré le ${new Date().toLocaleString('fr-MA')}`, MARGIN, y);
  doc.text(`Identifiant : ${workerId(w)}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;

  const colGap = 6;
  const colW = (CONTENT_W - colGap) / 2;
  const col2X = MARGIN + colW + colGap;

  const personalRows = [
    ['Prénom', w.prenom],
    ['Nom', w.nom],
    ['N° CIN', w.cin],
    ['Téléphone', w.telephone],
    ['Date naissance', fmtDate(w.date_naissance)],
    ['Lieu naissance', w.ville_naissance],
    ['Adresse', w.adresse],
    ['Nationalité', w.nationalite],
    ['Sexe', w.sexe === 'M' ? 'Masculin' : w.sexe === 'F' ? 'Féminin' : w.sexe],
    ['État civil', w.etat_civil],
    ['Groupe sanguin', w.groupe_sanguin],
    ['Expiration CIN', fmtDate(w.date_expiration)],
  ];

  const proRows = [
    ['Poste / Fonction', w.fonction],
    ['Chantier', w.chantier],
    ['Tarif horaire', fmtMAD(w.tarif) + '/h'],
    ['Statut', STATUT_LABELS[w.statut] || w.statut],
    ['Disponibilité', w.disponibilite === 'oui' ? 'Disponible' : 'Non disponible'],
    ['Date recrutement', fmtDate(w.date_recrutement)],
    ['Expérience', EXPERIENCE_LABELS[w.experience] || w.experience],
    ['Badge', w.badge],
    ['Pointure', w.pointure],
    ['Taille vêtement', w.taille_vetement],
    ['Casque', w.casque],
  ];

  const tablesTitleY = y;
  const yPersonalStart = drawSectionTitle(doc, '1. INFORMATIONS PERSONNELLES', MARGIN, tablesTitleY, colW);
  const yPersonalEnd = drawTable(doc, personalRows, yPersonalStart, MARGIN, colW);

  const yProStart = drawSectionTitle(doc, '2. INFORMATIONS PROFESSIONNELLES', col2X, tablesTitleY, colW);
  const yProEnd = drawTable(doc, proRows, yProStart, col2X, colW);

  y = Math.max(yPersonalEnd, yProEnd) + 4;

  y = drawSectionTitle(doc, "3. CONTACT D'URGENCE", MARGIN, y, CONTENT_W);
  y = drawContactBand(doc, w, y);

  const docsTitleY = y;
  y = drawSectionTitle(doc, '4. DOCUMENTS — CIN', MARGIN, docsTitleY, CONTENT_W) + 1;

  const cin = computeCinLayout(y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('CIN VERSO', cin.versoX + cin.cinBoxW / 2, cin.labelY, { align: 'center' });
  doc.text('CIN RECTO', cin.rectoX + cin.cinBoxW / 2, cin.labelY, { align: 'center' });

  containImage(doc, versoData, cin.versoX, cin.imgY, cin.cinBoxW, cin.cinBoxH, CIN_PDF_RATIO);
  containImage(doc, rectoData, cin.rectoX, cin.imgY, cin.cinBoxW, cin.cinBoxH, CIN_PDF_RATIO);

  drawFooter(doc);

  const safeName = `${w.nom || 'ouvrier'}_${w.prenom || ''}`.replace(/[^\w\-]+/g, '_');
  downloadPdfBlob(doc.output('blob'), `Fiche_Ouvrier_${safeName}.pdf`);
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
