/**
 * Administration ERP — modules, actions, rôles de base.
 */

export const ERP_MODULES = [
  { code: 'organisation_interne', label: 'Organisation interne' },
  { code: 'rh', label: 'RH' },
  { code: 'employes_externes', label: 'Employés externes' },
  { code: 'commercial_marketing', label: 'Commercial / Marketing' },
  { code: 'crm', label: 'CRM' },
  { code: 'logistique', label: 'Logistique' },
  { code: 'projets', label: 'Projets' },
  { code: 'documents', label: 'Documents' },
  { code: 'finance_tresorerie', label: 'Finance & Trésorerie' },
  { code: 'achats', label: 'Achats' },
  { code: 'inventaire_depot', label: 'Inventaire & Dépôt' },
  { code: 'administration', label: 'Administration' },
];

export const ERP_ACTIONS = [
  { code: 'voir', label: 'Lecture' },
  { code: 'creer', label: 'Création' },
  { code: 'modifier', label: 'Modification' },
  { code: 'supprimer', label: 'Suppression' },
  { code: 'valider', label: 'Validation' },
  { code: 'exporter', label: 'Export' },
];

/** Rôles ERP de base (code → libellé) */
export const BASE_ROLES = [
  { code: 'super_admin', nom: 'Super Admin', est_admin: true },
  { code: 'dg', nom: 'DG', est_admin: false },
  { code: 'rh', nom: 'RH', est_admin: false },
  { code: 'finance', nom: 'Finance', est_admin: false },
  { code: 'commercial', nom: 'Commercial', est_admin: false },
  { code: 'achats', nom: 'Achats', est_admin: false },
  { code: 'logistique', nom: 'Logistique', est_admin: false },
  { code: 'chef_projet', nom: 'Chef de projet', est_admin: false },
  { code: 'chef_chantier', nom: 'Chef de chantier', est_admin: false },
  { code: 'employe', nom: 'Employé', est_admin: false },
];

export const STATUT_USER_DB = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  inactif: 'Désactivé',
};

export const STATUT_USER_UI = {
  Actif: 'actif',
  Suspendu: 'suspendu',
  'Désactivé': 'inactif',
};

export const STATUT_ROLE_DB = { actif: 'Actif', inactif: 'Inactif' };
export const STATUT_ROLE_UI = { Actif: 'actif', Inactif: 'inactif' };

/** Matrice vide pour l’UI (label module → label action → bool) */
export function emptyPermissionMatrix() {
  const m = {};
  ERP_MODULES.forEach((mod) => {
    m[mod.label] = {};
    ERP_ACTIONS.forEach((a) => { m[mod.label][a.label] = false; });
  });
  return m;
}

export function fullPermissionMatrix() {
  const m = {};
  ERP_MODULES.forEach((mod) => {
    m[mod.label] = {};
    ERP_ACTIONS.forEach((a) => { m[mod.label][a.label] = true; });
  });
  return m;
}

/** DB rows → matrice UI */
export function permissionsToMatrix(rows) {
  const matrix = emptyPermissionMatrix();
  (rows || []).forEach((row) => {
    const mod = ERP_MODULES.find((m) => m.code === row.module_code);
    const act = ERP_ACTIONS.find((a) => a.code === row.action_code);
    if (mod && act && row.granted) {
      matrix[mod.label][act.label] = true;
    }
  });
  return matrix;
}

/** Matrice UI → payloads insert */
export function matrixToPermissionRows(roleId, matrix) {
  const rows = [];
  ERP_MODULES.forEach((mod) => {
    ERP_ACTIONS.forEach((act) => {
      rows.push({
        role_id: roleId,
        module_code: mod.code,
        action_code: act.code,
        granted: Boolean(matrix[mod.label]?.[act.label]),
      });
    });
  });
  return rows;
}

export function moduleLabel(code) {
  return ERP_MODULES.find((m) => m.code === code)?.label || code;
}

export function actionLabel(code) {
  return ERP_ACTIONS.find((a) => a.code === code)?.label || code;
}
