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
  'En étude',
  'Devis reçus',
  'En attente validation DG',
  'Devis validé',
  'Ordre d\'achat créé',
  'Ordre de paiement créé',
  'Commande envoyée',
  'En attente réception',
  'Réceptionnée',
  'Clôturée',
  'Refusée',
];

export const PURCHASE_STATUS_ORDER = [
  'Brouillon',
  'Soumise',
  'En étude',
  'Devis reçus',
  'En attente validation DG',
  'Devis validé',
  'Ordre d\'achat créé',
  'Ordre de paiement créé',
  'Commande envoyée',
  'En attente réception',
  'Réceptionnée',
  'Clôturée',
];

export const PURCHASE_STATUS_BADGE = {
  Brouillon: 'badge-grey',
  Soumise: 'badge-blue',
  'En étude': 'badge-orange',
  'Devis reçus': 'badge-purple',
  'En attente validation DG': 'badge-orange',
  'Devis validé': 'badge-green',
  Validée: 'badge-green',
  'Ordre d\'achat créé': 'badge-green',
  'Ordre de paiement créé': 'badge-green',
  'Commande envoyée': 'badge-blue',
  'En attente réception': 'badge-orange',
  Réceptionnée: 'badge-purple',
  Clôturée: 'badge-grey',
  Refusée: 'badge-red',
};

export const LEGACY_STATUS_MAP = {
  'En attente': 'Soumise',
  'En cours': 'En étude',
  'En étude Achats': 'En étude',
  'En validation DG': 'En attente validation DG',
  Validée: 'Devis validé',
  'Commande en cours': 'Commande envoyée',
  'Commande reçue': 'Réceptionnée',
  Terminée: 'Clôturée',
};

export function normalizePurchaseStatus(statut) {
  const s = String(statut || 'Brouillon').trim();
  return LEGACY_STATUS_MAP[s] || s;
}

export function purchaseStatusRank(statut) {
  const normalized = normalizePurchaseStatus(statut);
  const index = PURCHASE_STATUS_ORDER.indexOf(normalized);
  return index >= 0 ? index : 0;
}

export function getPurchaseStatusBadge(statut) {
  return PURCHASE_STATUS_BADGE[normalizePurchaseStatus(statut)] || 'badge-grey';
}

/** Libellé affiché dans l'UI (le statut en base reste normalisé). */
export const PURCHASE_STATUS_LABEL = {
  'En étude': 'En cours de traitement',
};

export function getPurchaseStatusLabel(statut) {
  const normalized = normalizePurchaseStatus(statut);
  return PURCHASE_STATUS_LABEL[normalized] || normalized;
}

export const QUOTE_STATUSES = {
  ACTIF: 'Actif',
  RETENU: 'Retenu',
  VERROUILLE: 'Verrouillé',
  REFUSE: 'Refusé',
};

export const QUOTE_STATUS_BADGE = {
  Actif: 'badge-blue',
  Retenu: 'badge-green',
  'Verrouillé': 'badge-grey',
  Refusé: 'badge-red',
};

export const OA_STATUSES = [
  'Brouillon',
  'Validé',
  'Envoyé fournisseur',
  'En attente réception',
  'Réceptionné',
  'Clôturé',
];

export const OA_TO_REQUEST_STATUS = {
  'Envoyé fournisseur': 'Commande envoyée',
  'En attente réception': 'En attente réception',
  Réceptionné: 'Réceptionnée',
  Clôturé: 'Clôturée',
};

/** Libellé affiché OA (statut en base inchangé). */
export const OA_STATUS_LABEL = {
  'Envoyé fournisseur': 'Validé',
};

export function getAcquisitionOrderStatusLabel(statut) {
  return OA_STATUS_LABEL[statut] || statut;
}

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

export function canDeletePurchaseRequest() {
  return true;
}

export function canSubmitPurchaseRequest(statut) {
  return normalizePurchaseStatus(statut) === 'Brouillon';
}

export function canAddQuoteToRequest(statut) {
  return ['Soumise', 'En étude', 'Devis reçus', 'En attente validation DG'].includes(normalizePurchaseStatus(statut));
}

export function canValidateQuoteOnRequest(statut) {
  const s = normalizePurchaseStatus(statut);
  return ['Devis reçus', 'En attente validation DG'].includes(s);
}
