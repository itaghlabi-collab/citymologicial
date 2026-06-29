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
  'Validée',
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
  Validée: 'badge-green',
  'Ordre d\'achat créé': 'badge-green',
  'Commande en cours': 'badge-blue',
  'Commande reçue': 'badge-purple',
  Clôturée: 'badge-grey',
  Refusée: 'badge-red',
};

/** Anciens statuts → nouveau workflow (affichage rétrocompat.) */
export const LEGACY_STATUS_MAP = {
  'En attente': 'Soumise',
  'En cours': 'En étude Achats',
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
  'En attente validation',
  'Validé',
  'Refusé',
  'Commandé',
  'Clôturé',
];

export function canEditPurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}

export function canDeletePurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}
