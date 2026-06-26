/** Actions Chef de projet — lecture seule côté affectation */

import { canEditProjectNeed } from '../../../constants/projectBesoins';

export function getBesoinActions(need) {
  if (!need) return [];
  const actions = [
    { key: 'view', label: 'Voir', icon: 'eye' },
    { key: 'pdf', label: 'Télécharger PDF', icon: 'download' },
    { key: 'delete', label: 'Supprimer', icon: 'trash' },
  ];

  if (canEditProjectNeed(need)) {
    actions.push({ key: 'edit', label: 'Modifier', icon: 'edit' });
  }

  if (need.statut === 'brouillon') {
    actions.push({ key: 'submit', label: 'Soumettre à la RH', icon: 'send' });
  }

  return actions;
}
