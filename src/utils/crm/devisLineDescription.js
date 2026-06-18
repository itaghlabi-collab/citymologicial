/**
 * Résout la description affichée d'une ligne devis :
 * priorité à la description enregistrée sur la ligne, sinon catalogue article.
 */
export function resolveLigneDescription(ligne, articles = []) {
  const stored = ligne?.description?.trim();
  if (stored) return stored;
  if (ligne?.article_id) {
    const art = articles.find((a) => String(a.id) === String(ligne.article_id));
    if (art?.description?.trim()) return art.description.trim();
  }
  if (ligne?.designation?.trim()) {
    const nom = ligne.designation.trim().toLowerCase();
    const art = articles.find((a) => (a.nom || '').trim().toLowerCase() === nom);
    if (art?.description?.trim()) return art.description.trim();
  }
  return '';
}

export function enrichLignesDescriptions(lignes, articles = []) {
  return (lignes || []).map((l) => {
    if (l.type !== 'article') return l;
    const description = resolveLigneDescription(l, articles);
    if (!description || description === (l.description || '').trim()) return l;
    return { ...l, description };
  });
}
