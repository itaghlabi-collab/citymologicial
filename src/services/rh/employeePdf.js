/**
 * employeePdf.js — Fiche employé RH PDF (A4 une page, jsPDF)
 */
import { jsPDF } from 'jspdf';

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
};

const PAGE_W = 210;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 297 - 8;

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

function displayName(emp) {
  return [emp.firstname, emp.lastname].filter(Boolean).join(' ').trim() || '—';
}

async function loadImageDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
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

function drawFooter(doc) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT INTERNE CITYMO — RH', PAGE_W / 2, FOOTER_Y, { align: 'center' });
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

function drawHeader(doc, emp, logoData, logoRatio) {
  const top = MARGIN;
  let logoH = 0;

  if (logoData) {
    const fit = fitInBox(50, 16, logoRatio);
    doc.addImage(logoData, imageFormat(logoData), MARGIN, top, fit.w, fit.h);
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
  let companyY = top + logoH + 3;
  [COMPANY.address, COMPANY.phone, COMPANY.email].forEach((line) => {
    doc.text(line, MARGIN, companyY);
    companyY += 3.2;
  });

  const nameBlockW = 70;
  const nameBlockH = 12;
  const nameBlockX = PAGE_W - MARGIN - nameBlockW;
  doc.setFillColor(...RED);
  doc.roundedRect(nameBlockX, top, nameBlockW, nameBlockH, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(
    doc.splitTextToSize(displayName(emp).toUpperCase(), nameBlockW - 4),
    nameBlockX + nameBlockW / 2,
    top + 7,
    { align: 'center' },
  );

  return Math.max(companyY, top + nameBlockH) + 4;
}

/**
 * Génère et télécharge la fiche PDF employé RH (1 page A4).
 * @param {object} employee — ligne Supabase employees
 */
export async function generateEmployeePdf(employee) {
  const emp = employee || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logoData = await loadImageDataUrl(LOGO_URL);
  const logoRatio = 2.75;

  let y = drawHeader(doc, emp, logoData, logoRatio);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_TITLE);
  doc.setTextColor(...TEXT);
  doc.text(`FICHE EMPLOYÉ — ${dash(emp.poste).toUpperCase()}`, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 10, y, PAGE_W - MARGIN - 10, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Généré le ${new Date().toLocaleString('fr-MA')}`, MARGIN, y);
  if (emp.id) {
    doc.text(`Réf. ${String(emp.id).slice(0, 8).toUpperCase()}`, PAGE_W - MARGIN, y, { align: 'right' });
  }
  y += 7;

  const colGap = 6;
  const colW = (CONTENT_W - colGap) / 2;
  const col2X = MARGIN + colW + colGap;

  const personalRows = [
    ['Prénom', emp.firstname],
    ['Nom', emp.lastname],
    ['Email', emp.email],
    ['Téléphone', emp.telephone],
    ['N° CIN', emp.numero_cin],
    ['Adresse', emp.adresse],
    ['Situation familiale', emp.situation_familiale],
  ];

  const proRows = [
    ['Poste', emp.poste],
    ['Département', emp.department],
    ['Date d\'embauche', fmtDate(emp.date_embauche)],
    ['Statut', emp.statut],
    ['Salaire', fmtMAD(emp.salaire)],
    ['CNSS', emp.cnss],
    ['Banque', emp.banque],
    ['RIB', emp.rib],
  ];

  const tablesTitleY = y;
  const yPersonalEnd = drawTable(
    doc,
    personalRows,
    drawSectionTitle(doc, '1. INFORMATIONS PERSONNELLES', MARGIN, tablesTitleY, colW),
    MARGIN,
    colW,
  );
  const yProEnd = drawTable(
    doc,
    proRows,
    drawSectionTitle(doc, '2. INFORMATIONS PROFESSIONNELLES', col2X, tablesTitleY, colW),
    col2X,
    colW,
  );

  y = Math.max(yPersonalEnd, yProEnd) + 4;
  drawSectionTitle(doc, '3. NOTES', MARGIN, y, CONTENT_W);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Document généré depuis le module Ressources Humaines CITYMO.', MARGIN, y + 10);

  drawFooter(doc);

  const safeName = `${emp.lastname || 'employe'}_${emp.firstname || ''}`.replace(/[^\w\-]+/g, '_');
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Fiche_Employe_${safeName}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
