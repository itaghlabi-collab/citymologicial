export const REMUNERATION_TYPES = ['À la tâche', 'Au m²', 'Au ml', 'Au forfait', 'Par service', 'Autre'];
export const UNIT_TYPES = ['tâche', 'm²', 'ml', 'unité', 'forfait', 'jour', 'heure'];
export const ASSIGNMENT_STATUSES = ['active', 'terminée', 'suspendue', 'annulée'];
export const SERVICE_STATUSES = ['pending', 'validated', 'rejected', 'paid'];
export const PAYMENT_METHODS = ['espèces', 'virement', 'chèque', 'autre'];
export const PAYMENT_STATUSES = ['paid', 'pending', 'cancelled'];
export const SUB_STATUTS = ['actif', 'inactif', 'suspendu', 'archive'];

export const ASSIGNMENT_STATUS_LABEL = {
  active: 'Active',
  'terminée': 'Terminée',
  suspendue: 'Suspendue',
  'annulée': 'Annulée',
};

export const SERVICE_STATUS_LABEL = {
  pending: 'En attente',
  validated: 'Validée',
  rejected: 'Rejetée',
  paid: 'Payée',
};

export const PAYMENT_STATUS_LABEL = {
  paid: 'Payé',
  pending: 'En attente',
  cancelled: 'Annulé',
};

export const SUB_STATUT_LABEL = {
  actif: 'Actif',
  inactif: 'Inactif',
  suspendu: 'Suspendu',
  archive: 'Archivé',
};

export const PAYMENT_BALANCE_LABEL = {
  'non payé': 'Non payé',
  'partiellement payé': 'Partiellement payé',
  'payé': 'Payé',
};
