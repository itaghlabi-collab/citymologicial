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

/** Lit Orientation EXIF (JPEG) — 1 = normal, 3 = 180°, 6/8 = 90°. */
function readJpegExifOrientation(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 2 || view.getUint16(0, false) !== 0xFFD8) return 1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xFFDA) break;
      if ((marker & 0xFF00) !== 0xFF00) break;
      const size = view.getUint16(offset, false);
      if (size < 2) break;
      if (marker === 0xFFE1 && offset + size <= view.byteLength) {
        if (view.getUint32(offset + 2, false) === 0x45786966) {
          const little = view.getUint16(offset + 10, false) === 0x4949;
          const base = offset + 8;
          const ifd0 = base + view.getUint32(base + 4, little);
          if (ifd0 + 2 > view.byteLength) break;
          const entries = view.getUint16(ifd0, little);
          for (let i = 0; i < entries; i += 1) {
            const entry = ifd0 + 2 + i * 12;
            if (entry + 12 > view.byteLength) break;
            if (view.getUint16(entry, little) === 0x0112) {
              return view.getUint16(entry + 8, little) || 1;
            }
          }
        }
      }
      offset += size;
    }
  } catch {
    /* ignore */
  }
  return 1;
}

function dataUrlToArrayBuffer(dataUrl) {
  const m = String(dataUrl || '').match(/^data:[^;]+;base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[1]);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function drawOrientedImageToCanvas(img, orientation, maxSide = 900) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH, 1));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const swap = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  switch (orientation) {
    case 2: ctx.translate(w, 0); ctx.scale(-1, 1); break;
    case 3: ctx.translate(w, h); ctx.rotate(Math.PI); break;
    case 4: ctx.translate(0, h); ctx.scale(1, -1); break;
    case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break;
    case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); break;
    case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(w, -h); ctx.scale(-1, 1); break;
    case 8: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); break;
    default: break;
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * Normalise l’orientation EXIF de la photo profil pour jsPDF
 * (le navigateur oriente l’<img>, addImage non).
 */
async function prepareProfilePhotoForPdf(dataUrl) {
  if (!dataUrl) return null;
  try {
    // Chemin moderne : bake EXIF via createImageBitmap
    if (typeof createImageBitmap === 'function') {
      const blob = await (await fetch(dataUrl)).blob();
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(blob);
      }
      const maxSide = 900;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (typeof bitmap.close === 'function') bitmap.close();
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    // Fallback : lire Orientation EXIF + canvas
    const buf = dataUrlToArrayBuffer(dataUrl);
    const orientation = buf ? readJpegExifOrientation(buf) : 1;
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('photo load'));
      el.src = dataUrl;
    });
    const canvas = drawOrientedImageToCanvas(img, orientation);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.warn('[PDF ouvrier] orientation photo ignorée', err?.message || err);
    return dataUrl;
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

  const [logoData, photoRaw, rectoRaw, versoRaw] = await Promise.all([
    loadImageDataUrl(LOGO_URL),
    loadImageDataUrl(w.photo),
    loadImageDataUrl(w.cin_recto),
    loadImageDataUrl(w.cin_verso),
  ]);

  const photoData = photoRaw ? await prepareProfilePhotoForPdf(photoRaw) : null;

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
    ['Date de naissance', fmtDate(w.date_naissance)],
    ['N° CIN', w.cin],
    ['Téléphone', w.telephone],
    ['Nationalité', w.nationalite],
    ['Sexe', w.sexe === 'M' ? 'Masculin' : w.sexe === 'F' ? 'Féminin' : w.sexe],
    ['État civil', w.etat_civil],
    ['Groupe sanguin', w.groupe_sanguin],
    ['Expiration CIN', fmtDate(w.date_expiration)],
  ];

  const dailyTarif = (() => {
    const tarif = Number(w.tarif) || 0;
    const unite = w.tarif_unite || 'heure';
    if (unite === 'jour') return tarif;
    if (unite === 'heure') return Math.round(tarif * 8 * 100) / 100;
    if (unite === 'semaine') return Math.round((tarif / 5) * 100) / 100;
    if (unite === 'mois') return Math.round((tarif / 26) * 100) / 100;
    return tarif;
  })();

  const proRows = [
    ['Poste / Fonction', w.fonction],
    ['Tarif journalier', fmtMAD(dailyTarif) + '/j'],
    ['Statut', STATUT_LABELS[w.statut] || w.statut],
    ['Badge', w.badge],
    ['Pointure', w.pointure],
    ['Taille vêtement', w.taille_vetement],
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
