/**
 * pdfShared.js — Utilitaires PDF Finance CITYMO
 */
import { jsPDF } from 'jspdf';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [200, 200, 200];

export const FINANCE_COMPANY = {
  name: 'CITYMO',
  address: '228 Bd Mohammed V, Casablanca 20000',
  phone: 'Tél : +212 52 231 0043',
  email: 'contact@citymo.ma',
  rc: null,
  ice: null,
};

async function loadImage(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFit(nw, nh, maxW, maxH) {
  const ratio = Math.min(maxW / nw, maxH / nh);
  return { w: nw * ratio, h: nh * ratio };
}

/** Charge le logo CITYMO (PNG) pour les exports PDF. */
export async function loadCompanyLogo() {
  return loadImage(LOGO_URL);
}

export async function createFinancePdf(title) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadCompanyLogo();
  if (logo) {
    const size = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(imageFit(img.naturalWidth, img.naturalHeight, 38, 16));
      img.onerror = () => resolve({ w: 38, h: 12 });
      img.src = logo;
    });
    doc.addImage(logo, 'PNG', 14, 10, size.w, size.h);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...RED);
  doc.text(title, 14, 32);
  doc.setDrawColor(...BORDER);
  doc.line(14, 35, 196, 35);
  return doc;
}

export function addFinanceFooter(doc, pageNum) {
  const y = 287;
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`${FINANCE_COMPANY.name} — ${FINANCE_COMPANY.address}`, 14, y);
  doc.text(`Page ${pageNum}`, 196, y, { align: 'right' });
}

/** Séparateur milliers insécable — évite les retours ligne jsPDF (ex. « 35 /000,00 »). */
const PDF_THOUSANDS_SEP = '\u00A0';

/** Format monétaire MAD — virgule décimale, compatible jsPDF (pas de toLocaleString). */
export function formatPdfMAD(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '- ' : '';
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, PDF_THOUSANDS_SEP);
  return `${sign}${grouped},${decPart} MAD`;
}

export { TEXT, MUTED, RED, BORDER };
