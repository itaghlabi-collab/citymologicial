/** Affichage UI des noms de catégories (MAJUSCULES uniquement à l'écran). */
export function formatCategoryDisplayName(nom) {
  return String(nom || '').trim().toLocaleUpperCase('fr-FR');
}
