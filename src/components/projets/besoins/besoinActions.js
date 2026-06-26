/** Actions disponibles par statut de besoin RH */

export function getBesoinActions(need) {
  if (!need) return [];
  const s = need.statut;
  const actions = [
    { key: 'view', label: 'Voir', icon: 'eye' },
    { key: 'pdf', label: 'Imprimer PDF', icon: 'download' },
  ];

  if (s === 'brouillon') {
    actions.push({ key: 'edit', label: 'Modifier', icon: 'edit' });
    actions.push({ key: 'submit', label: 'Soumettre', icon: 'send' });
    actions.push({ key: 'delete', label: 'Supprimer', icon: 'trash' });
  }

  if (['soumis', 'en_recherche_rh', 'partiellement_couvert'].includes(s)) {
    actions.push({ key: 'edit', label: 'Modifier', icon: 'edit' });
    actions.push({ key: 'assign', label: 'Affecter ressources', icon: 'users' });
    if (need.manque > 0 && !need.resource_request_id) {
      actions.push({ key: 'rh', label: 'Créer demande RH', icon: 'send' });
    }
    actions.push({ key: 'cancel', label: 'Annuler', icon: 'x' });
  }

  if (s === 'couvert') {
    actions.push({ key: 'close', label: 'Clôturer', icon: 'check' });
  }

  if (s === 'annule') {
    actions.push({ key: 'delete', label: 'Supprimer', icon: 'trash' });
  }

  return actions;
}
