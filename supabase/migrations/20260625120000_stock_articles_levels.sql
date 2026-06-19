-- Articles de stock — colonnes métier + niveaux de stock par emplacement
-- Ne supprime ni ne tronque aucune donnée existante.

-- Colonnes stock_articles
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_category_id_fkey'
  ) THEN
    ALTER TABLE public.stock_articles
      ADD CONSTRAINT stock_articles_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.stock_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_default_warehouse_id_fkey'
  ) THEN
    ALTER TABLE public.stock_articles
      ADD CONSTRAINT stock_articles_default_warehouse_id_fkey
      FOREIGN KEY (default_warehouse_id) REFERENCES public.stock_warehouses(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'stock_articles_default_project_id_fkey'
    ) THEN
      ALTER TABLE public.stock_articles
        ADD CONSTRAINT stock_articles_default_project_id_fkey
        FOREIGN KEY (default_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $fk$;

CREATE INDEX IF NOT EXISTS idx_stock_articles_category_id ON public.stock_articles (category_id);
CREATE INDEX IF NOT EXISTS idx_stock_articles_reference ON public.stock_articles (reference);
CREATE INDEX IF NOT EXISTS idx_stock_articles_statut ON public.stock_articles (statut);

-- Niveaux de stock par article / dépôt / projet
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

ALTER TABLE public.stock_levels ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.stock_levels ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE public.stock_levels ADD COLUMN IF NOT EXISTS emplacement TEXT;
ALTER TABLE public.stock_levels ADD COLUMN IF NOT EXISTS quantite NUMERIC(14,3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_stock_levels_article_id ON public.stock_levels (article_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_warehouse_id ON public.stock_levels (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_project_id ON public.stock_levels (project_id);

DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS stock_levels_updated_at ON public.stock_levels;
    CREATE TRIGGER stock_levels_updated_at
      BEFORE UPDATE ON public.stock_levels
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $trg$;

-- RLS stock_levels
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_levels_all_auth ON public.stock_levels;
CREATE POLICY stock_levels_all_auth ON public.stock_levels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.stock_levels TO authenticated;
GRANT ALL ON public.stock_levels TO service_role;
