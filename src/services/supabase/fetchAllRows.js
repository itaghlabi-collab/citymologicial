/**
 * fetchAllRows.js — Lecture complète d'une requête PostgREST, page par page.
 * PostgREST plafonne chaque réponse à 1000 lignes : sans pagination, les lignes
 * au-delà sont ignorées silencieusement.
 */
const PAGE_SIZE = 1000;

/**
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} buildQuery
 *   Fabrique une requête neuve (avec un ordre stable) à chaque page.
 * @returns {Promise<{ data: any[] | null, error: any }>}
 */
export async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows.length ? rows : null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
