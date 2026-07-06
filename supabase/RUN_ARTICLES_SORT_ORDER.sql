-- CITYMO ERP — Ordre personnalisé du catalogue articles CRM
-- Exécuter dans Supabase SQL Editor

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_articles_sort_order ON public.articles (sort_order ASC, created_at ASC);

-- Attribuer un ordre initial aux articles existants (par date de création)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, nom ASC) AS rn
  FROM public.articles
  WHERE sort_order IS NULL OR sort_order = 0
)
UPDATE public.articles a
SET sort_order = ranked.rn * 10
FROM ranked
WHERE a.id = ranked.id;
