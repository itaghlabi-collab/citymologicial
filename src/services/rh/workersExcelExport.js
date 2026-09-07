/**
 * workersExcelExport.js — Export Excel de tous les ouvriers externes
 */
import * as XLSX from 'xlsx';
import { workerTarifJournalier, workerChantierLabel } from './workers';

function statutLabel(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'actif') return 'Actif';
  if (v === 'inactif') return 'Inactif';
  return s || '';
}

function dispoLabel(d) {
  const v = String(d || '').toLowerCase();
  if (v === 'oui' || v === 'disponible') return 'Disponible';
  if (v === 'non' || v === 'en_chantier' || v === 'occupe') return 'En chantier';
  return d || '';
}

export function buildWorkersExcelRows(workers) {
  const list = Array.isArray(workers) ? workers : [];
  return list.map((w, i) => ({
    N: i + 1,
    Prénom: w.prenom || '',
    Nom: w.nom || '',
    CIN: w.cin || '',
    Téléphone: w.telephone || '',
    Fonction: w.fonction || '',
    'Tarif': Number(w.tarif) || 0,
    'Unité tarif': w.tarif_unite || '',
    'Tarif / jour (MAD)': workerTarifJournalier(w),
    Statut: statutLabel(w.statut),
    Disponibilité: dispoLabel(w.disponibilite),
    Chantier: workerChantierLabel(w) || w.chantier || '',
    'Date naissance': w.date_naissance || '',
    'Lieu naissance': w.ville_naissance || '',
    Adresse: w.adresse || '',
    Nationalité: w.nationalite || '',
    'État civil': w.etat_civil || '',
    Sexe: w.sexe || '',
    'Groupe sanguin': w.groupe_sanguin || '',
    'Date recrutement': w.date_recrutement || '',
    'Date expiration CIN': w.date_expiration || '',
    Expérience: w.experience || '',
    Badge: w.badge || '',
    'Contact urgence': w.contact_urgence || '',
    'Tél. urgence': w.tel_urgence || '',
    'Relation urgence': w.relation_urgence || '',
    Pointure: w.pointure || '',
    'Taille vêtement': w.taille_vetement || '',
    'Taille gants': w.taille_gants || '',
    Casque: w.casque || '',
  }));
}

/** Télécharge un .xlsx avec tous les ouvriers (navigateur). */
export function exportWorkersExcel(workers, { filename } = {}) {
  const rows = buildWorkersExcelRows(workers);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || { N: 1 }).map((k) => ({
    wch: Math.min(36, Math.max(10, String(k).length + 2)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ouvriers externes');

  const meta = XLSX.utils.aoa_to_sheet([
    ['CITYMO — Ouvriers externes'],
    ['Exporté le', new Date().toLocaleString('fr-MA')],
    ['Nombre', rows.length],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, 'Info');

  const stamp = new Date().toISOString().slice(0, 10);
  const name = filename || `CITYMO_Ouvriers_Externes_${stamp}.xlsx`;
  XLSX.writeFile(wb, name);
  return { filename: name, count: rows.length };
}
