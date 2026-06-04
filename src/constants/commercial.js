/* =============================================
   CITYMO ERP – Global Commercial / Marketing Enums
   Single source of truth – import from here in ALL modules.
   ============================================= */

/* ── TYPE_PROJET ── */
export const TYPE_PROJET_VALUES = [
  'villa',
  'appartement',
  'plateau_bureau',
  'showroom',
  'hotel',
  'immeuble',
  'local_industriel',
];

export const TYPE_PROJET_LABEL = {
  villa:            'Villa',
  appartement:      'Appartement',
  plateau_bureau:   'Plateau bureau',
  showroom:         'Showroom',
  hotel:            'Hotel',
  immeuble:         'Immeuble',
  local_industriel: 'Local industriel',
};

/* ── SOURCE ── */
export const SOURCE_VALUES = [
  'facebook_ads',
  'landing_page',
  'google_ads',
  'autre',
];

export const SOURCE_LABEL = {
  facebook_ads: 'Facebook Ads',
  landing_page: 'Landing Page',
  google_ads:   'Google Ads',
  autre:        'Autre',
};

/* ── ACTIONS (canal/mode contact prospect) ── */
export const ACTION_VALUES = [
  'Appel entrant',
  'Email',
  'WhatsApp',
  'Visite',
  'Referral',
  'Reseaux sociaux',
  'Autre',
];

/* ── NIVEAUX DECISIONNELS ── */
export const NIVEAU_VALUES = [
  'Decisionnaire',
  'Influenceur',
  'Utilisateur',
  'Inconnu',
];
