-- Dédoublonnage articles de stock — conserve le plus ancien par code OU par désignation
-- Exécuter dans Supabase SQL Editor (ne touche pas aux articles uniques)

-- 1. Doublons par référence (code article)
DELETE FROM public.stock_articles
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(reference))
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.stock_articles
    WHERE reference IS NOT NULL AND trim(reference) <> ''
  ) t
  WHERE rn > 1
);

-- 2. Doublons par désignation (nom)
DELETE FROM public.stock_articles
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(nom))
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.stock_articles
    WHERE nom IS NOT NULL AND trim(nom) <> ''
  ) t
  WHERE rn > 1
);

-- 3. Empêcher les futurs doublons sur le code article
CREATE UNIQUE INDEX IF NOT EXISTS stock_articles_reference_unique
  ON public.stock_articles (lower(trim(reference)))
  WHERE reference IS NOT NULL AND trim(reference) <> '';

-- Vérification
SELECT
  COUNT(*)::int AS total,
  COUNT(DISTINCT lower(trim(reference))) FILTER (WHERE reference IS NOT NULL AND trim(reference) <> '') AS refs_uniques,
  COUNT(DISTINCT lower(trim(nom))) FILTER (WHERE nom IS NOT NULL AND trim(nom) <> '') AS noms_uniques
FROM public.stock_articles;

SELECT reference, nom, COUNT(*)::int AS nb
FROM public.stock_articles
GROUP BY reference, nom
HAVING COUNT(*) > 1;
