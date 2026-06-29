/**
 * articleScanWorkflow.js — Helpers scan douchette (ajout lignes, matching demandes)
 */

export function addOrIncrementMovementLine(lignes, articleId, delta = 1, emptyLineFactory) {
  const id = String(articleId);
  const existingIdx = lignes.findIndex((l) => l.article_id && String(l.article_id) === id);
  if (existingIdx >= 0) {
    return lignes.map((l, i) => {
      if (i !== existingIdx) return l;
      const q = Number(l.quantite) || 0;
      return { ...l, quantite: String(q + delta) };
    });
  }
  const blankIdx = lignes.findIndex((l) => !l.article_id);
  if (blankIdx >= 0) {
    return lignes.map((l, i) => (i === blankIdx ? {
      ...l,
      article_id: articleId,
      quantite: String(delta),
    } : l));
  }
  return [...lignes, { ...emptyLineFactory(), article_id: articleId, quantite: String(delta) }];
}

export function matchRequestLineByArticle(lines, article) {
  if (!article || !lines?.length) return null;
  const byId = lines.find((l) => l.article_id && String(l.article_id) === String(article.id));
  if (byId) return byId;
  const des = String(article.designation || article.nom || '').trim().toLowerCase();
  const code = String(article.code || article.reference || '').trim().toLowerCase();
  return lines.find((l) => {
    const name = String(l.article_name || '').trim().toLowerCase();
    if (!name) return false;
    return name === des || name === code || name.includes(des) || des.includes(name);
  }) || null;
}

export function incrementPreparedLine(line, delta = 1) {
  const demanded = Number(line.quantite_demandee) || 0;
  const current = Number(line.quantite_preparee) || 0;
  const next = Math.min(demanded || current + delta, current + delta);
  return {
    ...line,
    quantite_preparee: demanded > 0 ? Math.min(next, demanded) : next,
  };
}

export function isLineFullyPrepared(line) {
  const demanded = Number(line.quantite_demandee) || 0;
  const prepared = Number(line.quantite_preparee) || 0;
  return demanded > 0 && prepared >= demanded;
}
