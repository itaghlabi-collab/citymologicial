/**
 * crmArchiveDisplay.js — Affichage archives importées dans Devis / Factures / Clients
 */
import { getArchivePdfUrl } from '../../services/crm/crmArchives';

export const ARCHIVE_IMPORTED_BADGE = { label: 'Archive importée', cls: 'badge-orange' };

export function archiveToDevisRow(archive) {
  return {
    id: `archive-${archive.id}`,
    archive_id: archive.id,
    reference: archive.reference || '—',
    titre: archive.intitule || archive.file_name,
    client_nom: archive.client_nom,
    client_id: archive.client_id,
    commercial: '—',
    total_ht: archive.total_ht,
    total_tva: archive.total_tva,
    total_ttc: archive.total_ttc,
    statut: 'archive_importee',
    date_creation: archive.date_document,
    date_validite: null,
    __isImportedArchive: true,
    __archive: archive,
  };
}

export function archiveToFactureRow(archive) {
  return {
    id: `archive-${archive.id}`,
    archive_id: archive.id,
    numero: archive.reference || '—',
    titre: archive.intitule || archive.file_name,
    client_nom: archive.client_nom,
    client_id: archive.client_id,
    devis_reference: archive.devis_reference,
    commercial: '—',
    total_ht: archive.total_ht,
    total_tva: archive.total_tva,
    total_ttc: archive.total_ttc,
    total_paye: 0,
    reste_a_payer: archive.total_ttc,
    statut: 'archive_importee',
    date_emission: archive.date_document,
    date_echeance: archive.date_echeance,
    __isImportedArchive: true,
    __archive: archive,
  };
}

export function mergeImportedArchives(baseRows, archives, mapper) {
  const mapped = (archives || []).map(mapper);
  return [...baseRows, ...mapped];
}

export function filterRowsWithArchives(rows, filters, isArchiveRow) {
  return rows;
}

export async function openArchivePdf(archive) {
  const url = await getArchivePdfUrl(archive);
  if (!url) throw new Error('PDF introuvable.');
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadArchivePdf(archive) {
  const url = await getArchivePdfUrl(archive);
  if (!url) throw new Error('PDF introuvable.');
  const a = document.createElement('a');
  a.href = url;
  a.download = archive.file_name || 'archive.pdf';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function archiveMatchesDevisFilters(archive, { search = '', statut = '', commercial = '' } = {}) {
  if (statut && statut !== 'archive_importee') return false;
  if (commercial) return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const hay = [archive.reference, archive.client_nom, archive.intitule, archive.file_name].join(' ').toLowerCase();
  return hay.includes(q);
}

export function archiveMatchesFactureFilters(archive, filters = {}) {
  if (filters.statut && filters.statut !== 'archive_importee') return false;
  if (filters.commercial) return false;
  if (filters.client_id && String(archive.client_id) !== String(filters.client_id)) return false;
  if (filters.date && archive.date_document !== filters.date) return false;
  if (filters.montant_min) {
    const min = Number(filters.montant_min);
    if (Number.isFinite(min) && (Number(archive.total_ttc) || 0) < min) return false;
  }
  const q = (filters.search || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [archive.reference, archive.client_nom, archive.intitule, archive.file_name].join(' ').toLowerCase();
  return hay.includes(q);
}
