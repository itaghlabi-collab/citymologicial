/**
 * mouvementPdf.js — PDF Bon de mouvement format CITYMO (A4, jsPDF)
 */
import { jsPDF } from 'jspdf';

const LOGO_URL = 'https://i.ibb.co/N6SbC06M/logopng.png';
const RED = [198, 40, 40];
const TEXT = [33, 33, 33];
const MUTED = [100, 100, 100];
const BORDER = [180, 180, 180];
const M = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - M * 2;

const COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000, Maroc',
  email: 'contact@citymo.ma',
  phone: 'Tél : 05 22 31 00 43',
  ice: 'ICE : 002023116000060',
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

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fieldRow(doc, y, label, value, x = M, w = CONTENT_W) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT);
  const lines = doc.splitTextToSize(value || '—', w - 4);
  doc.text(lines, x, y + 4.5);
  return y + 4.5 + lines.length * 4.2 + 4;
}

export async function generateMouvementPdf(bon, articles = []) {
  const logo = await loadImage(LOGO_URL);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = M;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CONTENT_W, 38);

  if (logo) {
    try { doc.addImage(logo, 'PNG', M + 4, y + 6, 36, 14); } catch { /* skip */ }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  let ly = y + 22;
  [COMPANY.address, COMPANY.email, COMPANY.phone, COMPANY.ice].forEach((line) => {
    doc.text(line, M + 4, ly);
    ly += 4;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...RED);
  doc.text('BON DE MOUVEMENT', PAGE_W - M - 4, y + 14, { align: 'right' });
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT);
  doc.text(`Réf. : ${bon.ref || '—'}`, PAGE_W - M - 4, y + 22, { align: 'right' });
  doc.text(`Date : ${fmtDate(bon.date_creation)}`, PAGE_W - M - 4, y + 28, { align: 'right' });
  doc.text(`Statut : ${bon.statut || 'Brouillon'}`, PAGE_W - M - 4, y + 34, { align: 'right' });

  y += 46;

  const colW = CONTENT_W / 3;
  const meta = [
    ['Type de mouvement', bon.type_mouvement || '—'],
    ['Emplacement source', bon.emplacement_source || '—'],
    ['Emplacement destination', bon.emplacement_destination || '—'],
    ['Créé par', bon.cree_par || '—'],
    ['Livreur', bon.livreur || '—'],
    ['Réceptionnaire', bon.receptionnaire || '—'],
  ];

  doc.setFillColor(248, 248, 248);
  doc.rect(M, y, CONTENT_W, 28, 'F');
  doc.setDrawColor(...BORDER);
  doc.rect(M, y, CONTENT_W, 28);

  meta.forEach(([label, val], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + 4 + col * colW;
    const my = y + 8 + row * 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, my);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    doc.text(doc.splitTextToSize(val, colW - 6), x, my + 4);
  });

  y += 36;
  if (bon.motif) y = fieldRow(doc, y, 'Motif', bon.motif);
  if (bon.note) y = fieldRow(doc, y, 'Notes', bon.note);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  doc.text('Articles', M, y);
  y += 6;

  const cols = [12, 78, 24, 56, CONTENT_W - 170];
  const headers = ['#', 'Article', 'Qté', 'Unité', 'Notes'];
  const xs = [M];
  for (let i = 1; i < cols.length; i++) xs[i] = xs[i - 1] + cols[i - 1];

  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, CONTENT_W, 8, 'F');
  headers.forEach((h, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(h, xs[i] + 2, y + 5.5);
  });
  y += 8;

  (bon.lignes || []).forEach((ligne, idx) => {
    const art = articles.find((a) => String(a.id) === String(ligne.article_id));
    const label = art
      ? `${art.code || art.reference} — ${art.designation || art.nom}`
      : (ligne.article_designation || ligne.article_code || '—');
    const unite = art?.unite || 'U';
    const notes = ligne.notes || '';
    const desLines = doc.splitTextToSize(label, cols[1] - 4);
    const noteLines = notes ? doc.splitTextToSize(notes, cols[4] - 4) : [];
    const rowH = Math.max(8, desLines.length * 3.8 + 3, noteLines.length * 3.5 + 3);

    if (y + rowH > 270) {
      doc.addPage();
      y = M;
    }

    doc.setDrawColor(...BORDER);
    doc.rect(M, y, CONTENT_W, rowH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(String(idx + 1), xs[0] + 2, y + 5);
    doc.text(desLines, xs[1] + 2, y + 5);
    doc.text(String(ligne.quantite ?? ''), xs[2] + 2, y + 5);
    doc.text(unite, xs[3] + 2, y + 5);
    if (noteLines.length) doc.text(noteLines, xs[4] + 2, y + 5);
    y += rowH;
  });

  y += 10;
  const totalLignes = (bon.lignes || []).length;
  const totalQte = (bon.lignes || []).reduce((s, l) => s + (Number(l.quantite) || 0), 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT);
  doc.text(`Lignes : ${totalLignes}  —  Quantité totale : ${totalQte}`, M, y);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Signature livreur', M, y);
  doc.text('Signature réceptionnaire', M + CONTENT_W / 2, y);
  doc.line(M, y + 14, M + 70, y + 14);
  doc.line(M + CONTENT_W / 2, y + 14, M + CONTENT_W / 2 + 70, y + 14);

  const filename = `bon-mouvement-${(bon.ref || 'draft').replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}
