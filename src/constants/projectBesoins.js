/** Métiers / fonctions chantier (aligné ouvriers externes) */
export const BESOIN_FONCTIONS = [
  'Maçon', 'Coffreur', 'Ferrailleur', 'Électricien', 'Peintre', 'Plombier',
  'Carreleur', 'Menuisier', 'Soudeur', 'Chauffeur', 'Manœuvre', 'Chef équipe',
  'Conducteur engins', 'Topographe',
];

export const BESOIN_PRIORITES = ['Normale', 'Haute', 'Urgente'];

export const BESOIN_REQUEST_STATUTS = [
  { value: 'en_attente', label: 'En attente', color: '#F57C00' },
  { value: 'en_cours', label: 'En cours', color: '#1565C0' },
  { value: 'affectee', label: 'Affectée', color: '#2E7D32' },
  { value: 'cloturee', label: 'Clôturée', color: '#757575' },
];

export const BESOIN_STAFF_STATUTS = {
  couvert: { label: 'Couvert', badge: 'badge-green' },
  partiel: { label: 'Partiel', badge: 'badge-orange' },
  manque: { label: 'Manque', badge: 'badge-red' },
};

export const BESOIN_MODULE_TABS = [
  { id: 'rh', label: 'Ressources humaines' },
  { id: 'materiels', label: 'Matériels / Équipements' },
  { id: 'materiaux', label: 'Matériaux' },
];
