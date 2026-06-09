-- =============================================================================
-- CITYMO — Inventaire : Catégories stock (stock_categories)
-- Coller dans Supabase → SQL Editor → Run (idempotent, sans DROP/TRUNCATE/DELETE)
-- Doublons seed ignorés : SCIE_SAUTEUSE et PERFORATEUR (1 ligne par code unique)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Table de base (si migration antérieure absente) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT,
  description     TEXT,
  statut          TEXT DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Colonnes cible ───────────────────────────────────────────────────────────
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS legacy_id INTEGER;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS stock_type TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Rétrocompat : nom/statut → name/is_active
UPDATE public.stock_categories
SET name = COALESCE(NULLIF(trim(name), ''), NULLIF(trim(nom), ''))
WHERE name IS NULL OR trim(name) = '';

UPDATE public.stock_categories
SET is_active = CASE
  WHEN is_active IS NOT NULL THEN is_active
  WHEN lower(coalesce(statut, '')) IN ('inactive', 'inactif', 'inactif', 'non', 'no', 'archived', 'archivé') THEN FALSE
  ELSE TRUE
END
WHERE is_active IS NULL;

UPDATE public.stock_categories
SET department = COALESCE(NULLIF(trim(department), ''), 'LOGISTIQUE')
WHERE department IS NULL OR trim(department) = '';

UPDATE public.stock_categories
SET stock_type = COALESCE(NULLIF(trim(stock_type), ''), 'OUTILLAGE')
WHERE stock_type IS NULL OR trim(stock_type) = '';

UPDATE public.stock_categories
SET code = 'LEGACY-' || LEFT(replace(id::text, '-', ''), 12)
WHERE code IS NULL OR trim(code) = '';

UPDATE public.stock_categories
SET name = COALESCE(NULLIF(trim(name), ''), code)
WHERE name IS NULL OR trim(name) = '';

-- Contrainte unique sur code
DO $uq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_categories_code_key' AND conrelid = 'public.stock_categories'::regclass
  ) THEN
    ALTER TABLE public.stock_categories ADD CONSTRAINT stock_categories_code_key UNIQUE (code);
  END IF;
END $uq$;

CREATE INDEX IF NOT EXISTS idx_stock_categories_code_lower
  ON public.stock_categories (lower(trim(code)));

CREATE INDEX IF NOT EXISTS idx_stock_categories_name_lower
  ON public.stock_categories (lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_stock_categories_department
  ON public.stock_categories (department);

CREATE INDEX IF NOT EXISTS idx_stock_categories_stock_type
  ON public.stock_categories (stock_type);

CREATE INDEX IF NOT EXISTS idx_stock_categories_is_active
  ON public.stock_categories (is_active);

DROP TRIGGER IF EXISTS stock_categories_updated_at ON public.stock_categories;
CREATE TRIGGER stock_categories_updated_at
  BEFORE UPDATE ON public.stock_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Préparer stock_articles pour liaison future ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT,
  nom             TEXT NOT NULL,
  categorie       TEXT,
  unite           TEXT DEFAULT 'U',
  prix_unitaire   NUMERIC(14,2) DEFAULT 0,
  seuil_alerte    NUMERIC(14,2) DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'Active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS category_id UUID;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_articles_category_id_fkey'
  ) THEN
    ALTER TABLE public.stock_articles
      ADD CONSTRAINT stock_articles_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.stock_categories(id) ON DELETE SET NULL;
  END IF;
END $fk$;

CREATE INDEX IF NOT EXISTS idx_stock_articles_category_id
  ON public.stock_articles (category_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_categories_all_auth ON public.stock_categories;
DROP POLICY IF EXISTS stock_categories_select_auth ON public.stock_categories;
DROP POLICY IF EXISTS stock_categories_insert_auth ON public.stock_categories;
DROP POLICY IF EXISTS stock_categories_update_auth ON public.stock_categories;
DROP POLICY IF EXISTS stock_categories_delete_auth ON public.stock_categories;

CREATE POLICY stock_categories_select_auth ON public.stock_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY stock_categories_insert_auth ON public.stock_categories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY stock_categories_update_auth ON public.stock_categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY stock_categories_delete_auth ON public.stock_categories
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.stock_categories TO authenticated, service_role;

-- ── Seed 24 catégories (UPSERT par code — doublons listés exclus) ─────────────
INSERT INTO public.stock_categories (legacy_id, code, name, description, department, stock_type, is_active)
VALUES
  (1,  'OUTILLAGE',            'OUTILLAGE',            NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (2,  'PEINTURE',             'PEINTURE',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (3,  'SOUDURE',              'SOUDURE',              NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (4,  'CLIMATISATION',        'CLIMATISATION',        NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (5,  'VISSEUSE',             'VISSEUSE',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (6,  'MEULEUSE_GM',          'MEULEUSE GM',          NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (7,  'MEULEUSE_PM',          'MEULEUSE PM',          NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (8,  'PERFORATEUR',          'PERFORATEUR',          NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (9,  'BURINEUR',             'BURINEUR',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (10, 'PERCEUSE',             'PERCEUSE',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (11, 'PONCEUSE',             'PONCEUSE',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (12, 'MELANGEUR',            'MELANGEUR',            'melangeur-malaxeur',    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (13, 'RAINUREUSE',           'RAINUREUSE',           NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (14, 'DEGAGEUR',             'DEGAGEUR',             NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (15, 'OUTILS_DE_MESURE',     'OUTILS DE MESURE',     NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (16, 'MENUISERIE_ALUMINIUM', 'MENUISERIE ALUMINIUM', NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (17, 'VIBREUR',              'VIBREUR',              NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (18, 'MENUISERIE_BOIS',      'MENUISERIE BOIS',      NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (19, 'SCIE_SAUTEUSE',        'SCIE SAUTEUSE',        NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (20, 'POLISSEUSE',           'POLISSEUSE',           NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (21, 'CISAILLE_ELECTRIQUE',  'CISAILLE ELECTRIQUE',  NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (22, 'SOUFFLEUR',            'SOUFFLEUR',            NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (23, 'LIGATUREUSE',          'LIGATUREUSE',          NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE),
  (24, 'CISAILLE_MANUELLE',    'CISAILLE MANUELLE',    NULL,                    'LOGISTIQUE', 'OUTILLAGE',       TRUE)
ON CONFLICT (code) DO UPDATE SET
  legacy_id   = COALESCE(EXCLUDED.legacy_id, stock_categories.legacy_id),
  name        = EXCLUDED.name,
  description = COALESCE(EXCLUDED.description, stock_categories.description),
  department  = EXCLUDED.department,
  stock_type  = EXCLUDED.stock_type,
  is_active   = EXCLUDED.is_active,
  nom         = EXCLUDED.name,
  statut      = CASE WHEN EXCLUDED.is_active THEN 'Active' ELSE 'Inactive' END,
  updated_at  = NOW();

-- Lier articles existants par libellé catégorie
UPDATE public.stock_articles a
SET category_id = c.id
FROM public.stock_categories c
WHERE a.category_id IS NULL
  AND a.categorie IS NOT NULL
  AND trim(a.categorie) <> ''
  AND (
    lower(trim(a.categorie)) = lower(trim(c.name))
    OR lower(trim(a.categorie)) = lower(trim(c.code))
  );

NOTIFY pgrst, 'reload schema';

SELECT
  COUNT(*)::int AS total_categories,
  COUNT(*) FILTER (WHERE is_active)::int AS actives,
  COUNT(*) FILTER (WHERE NOT is_active)::int AS inactives
FROM public.stock_categories;
