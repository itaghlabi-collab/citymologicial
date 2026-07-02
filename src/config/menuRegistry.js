/**
 * menuRegistry.js — Rubriques, sous-rubriques (routes) et lien départements CITYMO.
 * Source unique pour RBAC et filtrage du menu latéral.
 */
import { DEPARTMENTS } from '../data/departments';

/** Libellés courts départements (affichage Administration) */
export const DEPT_DISPLAY = {
  1: 'Commercial',
  2: 'Ressources Humaines',
  3: 'Achats',
  4: 'Marketing',
  5: 'Exploitation',
  6: 'Comptabilité / Finance',
  7: 'Administration',
  8: 'SAV',
  9: 'Logistique',
};

/**
 * Rubriques ERP = sections du menu.
 * departmentIds : départements « propriétaires » (référence departments.js, pas de duplication).
 */
export const ERP_RUBRIQUES = Object.freeze([
  {
    code: 'organisation_interne',
    label: 'Organisation Interne',
    departmentIds: [7],
    submodules: [
      { code: 'dashboard', label: 'Tableau de bord' },
      { code: 'taches', label: 'Tâches à faire' },
      { code: 'rendezvous', label: 'Rendez-vous' },
      { code: 'agenda-direction', label: 'Agenda de Direction', executiveOnly: true },
    ],
  },
  {
    code: 'ressources_humaines',
    label: 'Ressources Humaines',
    departmentIds: [2],
    submodules: [
      { code: 'departements', label: 'Départements' },
      { code: 'employes', label: 'Employés' },
      { code: 'conges', label: 'Demande de congé' },
      { code: 'demandes-ressources', label: 'Demandes de ressources' },
    ],
  },
  {
    code: 'employes_externes',
    label: 'Employés Externes',
    departmentIds: [2, 5],
    submodules: [
      { code: 'ouvriers', label: 'Ouvriers externes' },
      { code: 'presence', label: 'Présence ouvriers' },
      { code: 'heures-sup', label: 'Heures supplémentaires' },
      { code: 'paiement-hebdo', label: 'Paiement hebdo. ouvriers' },
    ],
  },
  {
    code: 'sous_traitants',
    label: 'Sous-traitants',
    departmentIds: [2, 5],
    submodules: [
      { code: 'sous-traitants', label: 'Sous-traitants' },
      { code: 'situation-sous-traitants', label: 'Situation sous-traitants' },
    ],
  },
  {
    code: 'commercial_marketing',
    label: 'Commercial / Marketing',
    departmentIds: [1, 4],
    submodules: [
      { code: 'prospects', label: 'Prospects' },
      { code: 'devis-attente', label: 'Devis en attente' },
      { code: 'planning-commercial', label: 'Planning commercial' },
      { code: 'actions-marketing', label: 'Actions marketing' },
      { code: 'compte-rendu-com', label: 'Compte rendu' },
      { code: 'depenses-com', label: 'Dépenses' },
      { code: 'propositions', label: 'Propositions' },
    ],
  },
  {
    code: 'crm',
    label: 'CRM',
    departmentIds: [1],
    submodules: [
      { code: 'clients', label: 'Clients' },
      { code: 'articles', label: 'Articles' },
      { code: 'categories', label: 'Catégories' },
      { code: 'devis', label: 'Devis' },
      { code: 'factures', label: 'Factures' },
      { code: 'bon-livraison', label: 'Bon de livraison' },
      { code: 'crm-archives', label: 'Archives' },
    ],
  },
  {
    code: 'logistique',
    label: 'Logistique',
    departmentIds: [9],
    submodules: [
      { code: 'vehicules', label: 'Véhicules' },
      { code: 'interventions', label: "Demandes d'intervention" },
      { code: 'historique-interv', label: "Historique d'intervention" },
    ],
  },
  {
    code: 'projets',
    label: 'Projets',
    departmentIds: [5, 8],
    submodules: [
      { code: 'projets', label: 'Projets' },
      { code: 'sav-projets', label: 'SAV' },
      { code: 'cr-sav', label: 'Comptes rendus SAV' },
    ],
  },
  {
    code: 'documents',
    label: 'Documents',
    departmentIds: [7],
    submodules: [
      { code: 'mes-documents', label: 'Mes documents' },
      { code: 'docs-partages', label: 'Documents partagés' },
      { code: 'liens-publics', label: 'Liens publics' },
      { code: 'corbeille', label: 'Corbeille' },
    ],
  },
  {
    code: 'finance_tresorerie',
    label: 'Finance & Trésorerie',
    departmentIds: [6],
    submodules: [
      { code: 'finance-dashboard', label: 'Tableau finance' },
      { code: 'feuille-caisse', label: 'Feuille de caisse' },
      { code: 'categories-charge', label: 'Catégories charge' },
      { code: 'charges', label: 'Charges' },
      { code: 'ordres-paiement', label: 'Ordre de paiement' },
    ],
  },
  {
    code: 'achats',
    label: 'Achats',
    departmentIds: [3],
    submodules: [
      { code: 'demandes-achat', label: "Demandes d'achat" },
      { code: 'bons-commande', label: 'Bon de commande' },
      { code: 'fournisseurs', label: 'Fournisseurs' },
      { code: 'ordres-achat', label: "Ordre d'achat" },
    ],
  },
  {
    code: 'inventaire_depot',
    label: 'Inventaire & Dépôt',
    departmentIds: [9],
    submodules: [
      { code: 'categories-stock', label: 'Catégories stock' },
      { code: 'articles-stock', label: 'Articles de stock' },
      { code: 'depots', label: 'Emplacements' },
      { code: 'bons-mouvements', label: 'Bons de mouvements' },
      { code: 'demandes-chantier', label: 'Demandes chantier' },
      { code: 'stocks', label: 'Stocks' },
      { code: 'inventaire-physique', label: 'Inventaire par scan' },
      { code: 'affectation-materiel', label: 'Affectation matériel' },
    ],
  },
  {
    code: 'administration',
    label: 'Administration',
    departmentIds: [7],
    submodules: [
      { code: 'utilisateurs', label: 'Utilisateurs' },
      { code: 'sauvegardes', label: 'Sauvegardes' },
    ],
  },
]);

export const ERP_ACTIONS = Object.freeze([
  { code: 'voir', label: 'Lecture' },
  { code: 'creer', label: 'Création' },
  { code: 'modifier', label: 'Modification' },
  { code: 'supprimer', label: 'Suppression' },
  { code: 'valider', label: 'Validation' },
  { code: 'exporter', label: 'Export' },
]);

/** Tous les codes sous-rubriques (route ids) */
export function allSubmoduleCodes() {
  const codes = [];
  ERP_RUBRIQUES.forEach((r) => r.submodules.forEach((s) => codes.push(s.code)));
  return codes;
}

export function findSubmodule(code) {
  for (const rub of ERP_RUBRIQUES) {
    const sub = rub.submodules.find((s) => s.code === code);
    if (sub) return { rubrique: rub, submodule: sub };
  }
  return null;
}

export function findRubrique(code) {
  return ERP_RUBRIQUES.find((r) => r.code === code) || null;
}

export function rubriquesForDepartment(departmentId) {
  const id = Number(departmentId);
  return ERP_RUBRIQUES.filter((r) => r.departmentIds.includes(id));
}

/** Modèle permissions par département (sous-rubriques avec lecture par défaut) */
export function departmentPermissionTemplate(departmentId) {
  const map = emptySubmodulePermissions();
  const rubriques = rubriquesForDepartment(departmentId);
  rubriques.forEach((rub) => {
    rub.submodules.forEach((sub) => {
      if (!sub.executiveOnly) {
        map[sub.code] = { voir: true, creer: false, modifier: false, supprimer: false, valider: false, exporter: false };
      }
    });
  });
  return map;
}

/** Modèles métiers prédéfinis */
export const ROLE_TEMPLATES = Object.freeze({
  rh: {
    departmentId: 2,
    permissions: () => {
      const m = emptySubmodulePermissions();
      ['departements', 'employes', 'conges', 'demandes-ressources', 'ouvriers', 'presence', 'heures-sup', 'paiement-hebdo', 'situation-sous-traitants', 'sous-traitants'].forEach((code) => {
        m[code] = { voir: true, creer: true, modifier: true, supprimer: false, valider: true, exporter: true };
      });
      return m;
    },
  },
  finance: {
    departmentId: 6,
    permissions: () => {
      const m = emptySubmodulePermissions();
      ['finance-dashboard', 'feuille-caisse', 'categories-charge', 'charges', 'ordres-paiement'].forEach((code) => {
        m[code] = { voir: true, creer: true, modifier: true, supprimer: false, valider: true, exporter: true };
      });
      return m;
    },
  },
  commercial: {
    departmentId: 1,
    permissions: () => {
      const m = emptySubmodulePermissions();
      const codes = [
        ...ERP_RUBRIQUES.find((r) => r.code === 'commercial_marketing').submodules.map((s) => s.code),
        ...ERP_RUBRIQUES.find((r) => r.code === 'crm').submodules.map((s) => s.code),
      ];
      codes.forEach((code) => {
        m[code] = { voir: true, creer: true, modifier: true, supprimer: false, valider: false, exporter: true };
      });
      return m;
    },
  },
  achats: {
    departmentId: 3,
    permissions: () => {
      const m = emptySubmodulePermissions();
      ERP_RUBRIQUES.find((r) => r.code === 'achats').submodules.forEach((s) => {
        m[s.code] = { voir: true, creer: true, modifier: true, supprimer: false, valider: true, exporter: true };
      });
      return m;
    },
  },
  logistique: {
    departmentId: 9,
    permissions: () => {
      const m = emptySubmodulePermissions();
      ['vehicules', 'interventions', 'historique-interv', 'categories-stock', 'articles-stock', 'depots', 'bons-mouvements', 'demandes-chantier', 'stocks', 'inventaire-physique', 'affectation-materiel'].forEach((code) => {
        m[code] = { voir: true, creer: true, modifier: true, supprimer: false, valider: false, exporter: true };
      });
      return m;
    },
  },
});

export function emptySubmodulePermissions() {
  const m = {};
  allSubmoduleCodes().forEach((code) => {
    m[code] = { voir: false, creer: false, modifier: false, supprimer: false, valider: false, exporter: false };
  });
  return m;
}

export function fullSubmodulePermissions() {
  const m = {};
  allSubmoduleCodes().forEach((code) => {
    m[code] = { voir: true, creer: true, modifier: true, supprimer: true, valider: true, exporter: true };
  });
  return m;
}

export function getDepartmentOptions() {
  return DEPARTMENTS.map((d) => ({
    value: d.id,
    label: DEPT_DISPLAY[d.id] || d.nom,
    code: d.code,
  }));
}
