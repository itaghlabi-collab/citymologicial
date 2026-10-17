/**
 * Lecture complète d'une requête PostgREST, page par page (plafond 1000 lignes par réponse).
 * buildQuery doit renvoyer une requête neuve avec un ordre stable à chaque appel.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows.length ? rows : null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
