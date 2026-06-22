/**
 * Administration ERP — constantes RBAC (délègue au menuRegistry).
 */
export {
  ERP_RUBRIQUES,
  ERP_ACTIONS,
  ERP_RUBRIQUES as ERP_MODULES,
  DEPT_DISPLAY,
  allSubmoduleCodes,
  findSubmodule,
  findRubrique,
  rubriquesForDepartment,
  departmentPermissionTemplate,
  ROLE_TEMPLATES,
  emptySubmodulePermissions,
  fullSubmodulePermissions,
  getDepartmentOptions,
} from '../../config/menuRegistry';

import {
  ERP_RUBRIQUES,
  ERP_ACTIONS,
  emptySubmodulePermissions,
  fullSubmodulePermissions,
  findSubmodule,
} from '../../config/menuRegistry';

/** Rôles ERP de base */
export const BASE_ROLES = [
  { code: 'super_admin', nom: 'Super Admin', est_admin: true, departmentId: 7 },
  { code: 'dg', nom: 'DG', est_admin: false, departmentId: 7 },
  { code: 'rh', nom: 'RH', est_admin: false, departmentId: 2, template: 'rh' },
  { code: 'finance', nom: 'Finance', est_admin: false, departmentId: 6, template: 'finance' },
  { code: 'commercial', nom: 'Commercial', est_admin: false, departmentId: 1, template: 'commercial' },
  { code: 'achats', nom: 'Achats', est_admin: false, departmentId: 3, template: 'achats' },
  { code: 'logistique', nom: 'Logistique', est_admin: false, departmentId: 9, template: 'logistique' },
  { code: 'chef_projet', nom: 'Chef de projet', est_admin: false, departmentId: 5 },
  { code: 'chef_chantier', nom: 'Chef de chantier', est_admin: false, departmentId: 5 },
  { code: 'employe', nom: 'Employé', est_admin: false, departmentId: null },
];

export const STATUT_USER_DB = { actif: 'Actif', suspendu: 'Suspendu', inactif: 'Désactivé' };
export const STATUT_USER_UI = { Actif: 'actif', Suspendu: 'suspendu', 'Désactivé': 'inactif' };
export const STATUT_ROLE_DB = { actif: 'Actif', inactif: 'Inactif' };
export const STATUT_ROLE_UI = { Actif: 'actif', Inactif: 'inactif' };

/** Labels rubriques pour rétrocompat UI */
export const MODULES_ERP = ERP_RUBRIQUES.map((r) => r.label);
export const ACTIONS_PERMS = ERP_ACTIONS.map((a) => a.label);

/** DB rows → map { submoduleCode: { voir, creer, ... } } */
export function permissionsToSubmoduleMap(rows) {
  const map = emptySubmodulePermissions();
  (rows || []).forEach((row) => {
    const code = row.submodule_code || row.module_code;
    if (!code || !map[code]) return;
    if (row.granted) {
      map[code][row.action_code] = true;
    }
  });
  return map;
}

/** map → rows insert role_permissions */
export function submoduleMapToPermissionRows(roleId, map) {
  const rows = [];
  Object.entries(map || {}).forEach(([submoduleCode, actions]) => {
    const found = findSubmodule(submoduleCode);
    const rubriqueCode = found?.rubrique?.code || 'unknown';
    ERP_ACTIONS.forEach((act) => {
      rows.push({
        role_id: roleId,
        module_code: rubriqueCode,
        submodule_code: submoduleCode,
        action_code: act.code,
        granted: Boolean(actions?.[act.code]),
      });
    });
  });
  return rows;
}

/** Rétrocompat matrice rubrique (agrégée) */
export function permissionsToMatrix(rows) {
  const matrix = {};
  ERP_RUBRIQUES.forEach((rub) => {
    matrix[rub.label] = {};
    ERP_ACTIONS.forEach((a) => { matrix[rub.label][a.label] = false; });
    const subs = rub.submodules.map((s) => s.code);
    const rubRows = (rows || []).filter((r) =>
      r.module_code === rub.code || subs.includes(r.submodule_code),
    );
    ERP_ACTIONS.forEach((act) => {
      const anyGranted = rubRows.some((r) => r.action_code === act.code && r.granted);
      matrix[rub.label][act.label] = anyGranted;
    });
  });
  return matrix;
}

export function emptyPermissionMatrix() {
  return permissionsToMatrix([]);
}

export function fullPermissionMatrix() {
  const fakeRows = [];
  ERP_RUBRIQUES.forEach((rub) => {
    rub.submodules.forEach((sub) => {
      ERP_ACTIONS.forEach((act) => {
        fakeRows.push({
          module_code: rub.code,
          submodule_code: sub.code,
          action_code: act.code,
          granted: true,
        });
      });
    });
  });
  return permissionsToMatrix(fakeRows);
}

export function matrixToPermissionRows(roleId, matrix) {
  const map = emptySubmodulePermissions();
  ERP_RUBRIQUES.forEach((rub) => {
    const rubPerms = matrix[rub.label];
    if (!rubPerms) return;
    rub.submodules.forEach((sub) => {
      ERP_ACTIONS.forEach((act) => {
        if (rubPerms[act.label]) {
          map[sub.code][act.code] = true;
        }
      });
    });
  });
  return submoduleMapToPermissionRows(roleId, map);
}

export function moduleLabel(code) {
  const rub = ERP_RUBRIQUES.find((r) => r.code === code);
  if (rub) return rub.label;
  const found = findSubmodule(code);
  return found?.submodule?.label || code;
}

export function actionLabel(code) {
  return ERP_ACTIONS.find((a) => a.code === code)?.label || code;
}
