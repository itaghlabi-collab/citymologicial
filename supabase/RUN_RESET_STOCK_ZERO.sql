-- =============================================================================
-- CITYMO — Remise à zéro du stock articles (stock_levels)
-- À coller dans Supabase → SQL Editor → Run
--
-- Effet :
--   • Toutes les quantités stock_levels → 0
--   • Chaque article reçoit une ligne à son emplacement (ou DEPOT LAKHYAYTA) à 0
--   • L'UI affichera 0 U (plus de stock fantôme depuis l'historique mouvements)
--
-- L'historique stock_movements est CONSERVÉ (traçabilité).
-- =============================================================================

-- 1. Mettre à 0 toutes les lignes existantes
UPDATE public.stock_levels
SET quantite = 0
WHERE quantite IS DISTINCT FROM 0;

-- 2. Créer une ligne à 0 pour chaque article sans stock_levels
INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT
  a.id,
  COALESCE(NULLIF(TRIM(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  0,
  NULL,
  NULL
FROM public.stock_articles a
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stock_levels l
  WHERE l.article_id = a.id
    AND lower(trim(coalesce(l.emplacement, ''))) = lower(trim(coalesce(a.emplacement, 'DEPOT LAKHYAYTA')))
);

-- 3. Articles sans aucune ligne stock_levels : ligne dépôt par défaut
INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT
  a.id,
  COALESCE(NULLIF(TRIM(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  0,
  NULL,
  NULL
FROM public.stock_articles a
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_levels l WHERE l.article_id = a.id
);

-- 4. Vérification
SELECT
  (SELECT COUNT(*)::int FROM public.stock_articles) AS articles,
  (SELECT COUNT(*)::int FROM public.stock_levels) AS lignes_stock,
  (SELECT COALESCE(SUM(quantite), 0)::numeric FROM public.stock_levels) AS total_quantite,
  (SELECT COUNT(*)::int FROM public.stock_levels WHERE quantite > 0) AS lignes_avec_stock;

NOTIFY pgrst, 'reload schema';
