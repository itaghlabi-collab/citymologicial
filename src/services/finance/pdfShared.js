/**
 * pdfShared.js — Utilitaires PDF Finance CITYMO
 */
import { jsPDF } from 'jspdf';
import { moneyToNumber } from '../../utils/decimalMoney';

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

async function loadImage(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
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
  } finally {
    clearTimeout(timer);
  }
}

function imageFit(nw, nh, maxW, maxH) {
  const ratio = Math.min(maxW / nw, maxH / nh);
  return { w: nw * ratio, h: nh * ratio };
}

/** Logo CITYMO dimensionné sans déformation (contain dans maxW × maxH). */
export async function loadCompanyLogoFit(maxW = 42, maxH = 16) {
  const dataUrl = await loadCompanyLogo();
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ dataUrl, ...imageFit(img.naturalWidth, img.naturalHeight, maxW, maxH) });
    img.onerror = () => resolve({ dataUrl, w: maxW, h: maxW / 2.75 });
    img.src = dataUrl;
  });
}

/** Charge le logo CITYMO (PNG) pour les exports PDF. */
export async function loadCompanyLogo() {
  return loadImage(LOGO_URL);
}

export async function createFinancePdf(title) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadCompanyLogoFit(38, 16);
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', 14, 10, logo.w, logo.h);
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

function formatPdfNumberParts(value, { decimals }) {
  const num = moneyToNumber(value);
  if (!Number.isFinite(num)) {
    return decimals === 0 ? '0' : `0${PDF_THOUSANDS_SEP},${'0'.repeat(decimals)}`;
  }
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (decimals === 0) {
    const intVal = Math.round(abs);
    const grouped = String(intVal).replace(/\B(?=(\d{3})+(?!\d))/g, PDF_THOUSANDS_SEP);
    return `${sign}${grouped}`;
  }
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, PDF_THOUSANDS_SEP);
  return `${sign}${grouped},${decPart}`;
}

/** Quantité PDF : entier sans virgule (4, pas 4,00). Fraction rare → décimales minimales. */
export function formatPdfQty(value) {
  const num = moneyToNumber(value);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num);
  if (Math.abs(num - rounded) < 1e-6) {
    return formatPdfNumberParts(rounded, { decimals: 0 });
  }
  const raw = String(num).replace('.', ',');
  const [intPart, decPart] = raw.split(',');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, PDF_THOUSANDS_SEP);
  return decPart ? `${grouped},${decPart}` : grouped;
}

/** Montant PDF (HT, PU, TTC) : toujours 2 décimales (750,00). */
export function formatPdfAmount(value) {
  return formatPdfNumberParts(value, { decimals: 2 });
}

/** Format monétaire MAD — virgule décimale, compatible jsPDF (pas de toLocaleString). */
export function formatPdfMAD(n) {
  return `${formatPdfAmount(n)} MAD`;
}

export { TEXT, MUTED, RED, BORDER };
