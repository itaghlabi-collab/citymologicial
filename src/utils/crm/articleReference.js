/** Utilitaires références articles courtes (E001, CL001, …). */

export function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lettre(s) préfixe à partir du nom de catégorie (1 lettre, 2 si collision). */
export function categoryRefPrefix(nom, allCategoryNoms = []) {
  const letters = stripAccents(nom).toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return 'A';

  const first = letters[0];
  const sameFirst = (allCategoryNoms || []).filter((n) => {
    const L = stripAccents(n).toUpperCase().replace(/[^A-Z]/g, '');
    return L && L[0] === first;
  });

  if (sameFirst.length <= 1) return first;
  return letters.slice(0, 2) || first;
}

/** Prochaine référence disponible pour un préfixe donné. */
export function nextReferenceForPrefix(prefix, existingRefs = []) {
  const p = String(prefix || 'A').toUpperCase();
  const re = new RegExp(`^${p}(\\d+)$`, 'i');
  let max = 0;
  (existingRefs || []).forEach((ref) => {
    const m = String(ref || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${p}${String(max + 1).padStart(3, '0')}`;
}
