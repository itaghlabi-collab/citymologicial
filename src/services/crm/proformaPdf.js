/**
 * proformaPdf.js — PDF Facture Proforma (même moteur que facturePdf)
 * Disponible pour tous les statuts, y compris brouillon.
 */
import { generateFacturePdf } from './facturePdf';

export async function generateProformaPdf(proforma, catMap = {}, options = {}) {
  if (!proforma) {
    throw new Error('Proforma introuvable.');
  }
  return generateFacturePdf(
    {
      ...proforma,
      document_kind: 'proforma',
      date_echeance: proforma.date_validite || proforma.date_echeance || '',
      date_validite: proforma.date_validite || proforma.date_echeance || '',
      titre: String(proforma.titre || '')
        .replace(/^proforma\s*[—–-]\s*/i, '')
        .trim() || proforma.titre,
    },
    catMap,
    { ...options, documentKind: 'proforma' },
  );
}
