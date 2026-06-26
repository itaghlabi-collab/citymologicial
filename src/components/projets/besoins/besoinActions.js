/** Actions Chef de projet — lecture seule côté affectation */

import { canDeleteProjectNeed, canEditProjectNeed } from '../../../constants/projectBesoins';

export function getBesoinActions(need) {
  if (!need) return [];
  const actions = [
    { key: 'view', label: 'Voir', icon: 'eye' },
    { key: 'pdf', label: 'Télécharger PDF', icon: 'download' },
  ];

  if (canEditProjectNeed(need)) {
    actions.push({ key: 'edit', label: 'Modifier', icon: 'edit' });
  }

  if (need.statut === 'brouillon') {
    actions.push({ key: 'submit', label: 'Soumettre à la RH', icon: 'send' });
  }

  if (canDeleteProjectNeed(need)) {
    actions.push({ key: 'delete', label: 'Supprimer', icon: 'trash' });
  }

  return actions;
}
