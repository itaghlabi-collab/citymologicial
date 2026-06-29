/**
 * routes.js — CITYMO Route/Module ID Registry
 *
 * Single source of truth for all module IDs used in navigation.
 * Import this instead of using raw strings in components.
 *
 * Compatible with:
 *   - React Router (when added)
 *   - Current tab-based navigation in App.jsx
 */

export const ROUTES = {
  // Organisation Interne
  DASHBOARD:          'dashboard',
  TACHES:             'taches',
  RENDEZVOUS:         'rendezvous',
  AGENDA_DIRECTION:   'agenda-direction',

  // Ressources Humaines
  DEPARTEMENTS:       'departements',
  EMPLOYES:           'employes',
  CONGES:             'conges',
  DEMANDES_RESSOURCES: 'demandes-ressources',

  // Employes Externes
  OUVRIERS:           'ouvriers',
  PRESENCE:           'presence',
  HEURES_SUP:         'heures-sup',
  PAIEMENT_HEBDO:     'paiement-hebdo',
  SITUATION_SOUS_TRAITANTS: 'situation-sous-traitants',
  SOUS_TRAITANTS:     'sous-traitants',

  // Commercial / Marketing
  PROSPECTS:          'prospects',
  DEVIS_ATTENTE:      'devis-attente',
  PLANNING_COMMERCIAL:'planning-commercial',
  ACTIONS_MARKETING:  'actions-marketing',
  COMPTE_RENDU_COM:   'compte-rendu-com',
  DEPENSES_COM:       'depenses-com',
  PROPOSITIONS:       'propositions',

  // CRM
  CLIENTS:            'clients',
  ARTICLES:           'articles',
  CATEGORIES:         'categories',
  DEVIS:              'devis',
  FACTURES:           'factures',
  BON_LIVRAISON:      'bon-livraison',

  // Logistique
  VEHICULES:          'vehicules',
  INTERVENTIONS:      'interventions',
  HISTORIQUE_INTERV:  'historique-interv',

  // Projets
  PROJETS:            'projets',
  SAV_PROJETS:        'sav-projets',
  CR_SAV:             'cr-sav',

  // Documents
  MES_DOCUMENTS:      'mes-documents',
  DOCS_PARTAGES:      'docs-partages',
  LIENS_PUBLICS:      'liens-publics',
  CORBEILLE:          'corbeille',

  // Finance
  FINANCE_DASHBOARD:  'finance-dashboard',
  FEUILLE_CAISSE:     'feuille-caisse',
  CATEGORIES_CHARGE:  'categories-charge',
  CHARGES:            'charges',
  ORDRES_PAIEMENT:    'ordres-paiement',

  // Achats
  DEMANDES_ACHAT:     'demandes-achat',
  BONS_COMMANDE:      'bons-commande',
  FOURNISSEURS:       'fournisseurs',
  COMPARAISON_DEVIS:  'comparaison-devis',
  ORDRES_ACHAT:       'ordres-achat',
  ORDRES_PAIEMENT_ACHATS: 'ordres-paiement-achats',

  // Inventaire
  CATEGORIES_STOCK:   'categories-stock',
  ARTICLES_STOCK:     'articles-stock',
  DEPOTS:             'depots',
  BONS_MOUVEMENTS:    'bons-mouvements',
  STOCKS:             'stocks',
  DEMANDES_CHANTIER:  'demandes-chantier',

  // Administration
  UTILISATEURS:       'utilisateurs',
  ROLES:              'roles',
  SAUVEGARDES:        'sauvegardes',
};
