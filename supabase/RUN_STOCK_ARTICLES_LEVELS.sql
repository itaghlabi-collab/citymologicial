-- Articles de stock — colonnes métier + table stock_levels
-- Copier-coller dans Supabase SQL Editor (ne supprime aucune donnée)

ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS article_type TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS numero_serie TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS etat TEXT DEFAULT 'Neuf';
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS emplacement TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS default_warehouse_id UUID;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS default_project_id UUID;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_category_id_fkey') THEN
    ALTER TABLE public.stock_articles
      ADD CONSTRAINT stock_articles_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.stock_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_default_warehouse_id_fkey') THEN
    ALTER TABLE public.stock_articles
      ADD CONSTRAINT stock_articles_default_warehouse_id_fkey
      FOREIGN KEY (default_warehouse_id) REFERENCES public.stock_warehouses(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_default_project_id_fkey') THEN
      ALTER TABLE public.stock_articles
        ADD CONSTRAINT stock_articles_default_project_id_fkey
        FOREIGN KEY (default_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $fk$;

CREATE INDEX IF NOT EXISTS idx_stock_articles_category_id ON public.stock_articles (category_id);
CREATE INDEX IF NOT EXISTS idx_stock_articles_reference ON public.stock_articles (reference);

CREATE TABLE IF NOT EXISTS public.stock_levels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES public.stock_articles(id) ON DELETE CASCADE,
  warehouse_id    UUID REFERENCES public.stock_warehouses(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  emplacement     TEXT,
  quantite        NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_article_id ON public.stock_levels (article_id);

ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_levels_all_auth ON public.stock_levels;
CREATE POLICY stock_levels_all_auth ON public.stock_levels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.stock_levels TO authenticated;
GRANT ALL ON public.stock_levels TO service_role;
