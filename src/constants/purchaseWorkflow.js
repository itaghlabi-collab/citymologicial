/**
 * purchaseWorkflow.js — Statuts et constantes workflow Achats CITYMO
 */

export const PURCHASE_ASSIGNEE = {
  name: 'LAILA WOTFI',
  label: "LAILA WOTFI — Chargée d'Achats",
  poste: "Chargée d'Achats",
};

export const PURCHASE_STATUSES = [
  'Brouillon',
  'Soumise',
  'En étude Achats',
  'Devis reçus',
  'En validation DG',
  'Devis validé',
  'Ordre d\'achat créé',
  'Commande en cours',
  'Commande reçue',
  'Clôturée',
  'Refusée',
];

export const PURCHASE_STATUS_BADGE = {
  Brouillon: 'badge-grey',
  Soumise: 'badge-blue',
  'En étude Achats': 'badge-orange',
  'Devis reçus': 'badge-purple',
  'En validation DG': 'badge-orange',
  'Devis validé': 'badge-green',
  Validée: 'badge-green',
  'Ordre d\'achat créé': 'badge-green',
  'Commande en cours': 'badge-blue',
  'Commande reçue': 'badge-purple',
  Clôturée: 'badge-grey',
  Refusée: 'badge-red',
};

export const LEGACY_STATUS_MAP = {
  'En attente': 'Soumise',
  'En cours': 'En étude Achats',
  Validée: 'Devis validé',
  Terminée: 'Clôturée',
};

export function normalizePurchaseStatus(statut) {
  const s = String(statut || 'Brouillon').trim();
  return LEGACY_STATUS_MAP[s] || s;
}

export const QUOTE_STATUSES = {
  ACTIF: 'Actif',
  RETENU: 'Retenu',
  VERROUILLE: 'Verrouillé',
  REFUSE: 'Refusé',
};

export const OA_STATUSES = [
  'Brouillon',
  'Validé',
  'Envoyé fournisseur',
  'En attente réception',
  'Réceptionné',
  'Clôturé',
];

export const OA_STATUS_BADGE = {
  Brouillon: 'badge-grey',
  Validé: 'badge-green',
  'Envoyé fournisseur': 'badge-blue',
  'En attente réception': 'badge-orange',
  Réceptionné: 'badge-purple',
  Clôturé: 'badge-grey',
  'En attente validation': 'badge-orange',
  Refusé: 'badge-red',
  Commandé: 'badge-blue',
};

export const OP_ACHATS_STATUSES = [
  'À préparer',
  'En attente validation DG',
  'Validé',
  'Payé',
  'Annulé',
];

export const OP_ACHATS_STATUS_BADGE = {
  'À préparer': 'badge-grey',
  'En attente validation DG': 'badge-orange',
  Validé: 'badge-green',
  Payé: 'badge-purple',
  Annulé: 'badge-red',
  Brouillon: 'badge-grey',
  'En attente': 'badge-orange',
};

export function canEditPurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}

export function canDeletePurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}

export function canSubmitPurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}

export function canAddQuoteToRequest(statut) {
  return ['Soumise', 'En étude Achats', 'Devis reçus', 'En validation DG'].includes(normalizePurchaseStatus(statut));
}

export function canValidateQuoteOnRequest(statut) {
  const s = normalizePurchaseStatus(statut);
  return ['Devis reçus', 'En validation DG'].includes(s);
}
