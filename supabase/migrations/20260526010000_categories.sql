-- CRM Catégories articles
-- Champs : id, nom, parent_id, slug, created_at, updated_at
-- Seed CITYMO idempotent (ON CONFLICT slug DO NOTHING)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT NOT NULL,
  parent_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_categories_nom ON public.categories(nom);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON public.categories(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_nom_lower_unique ON public.categories (lower(trim(nom)));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_all_auth ON public.categories;
CREATE POLICY categories_all_auth ON public.categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- ── Niveau 1 : catégories racines CITYMO ──
INSERT INTO public.categories (nom, parent_id, slug) VALUES
  ('Gros oeuvre', NULL, 'gros-oeuvre'),
  ('Second oeuvre', NULL, 'second-oeuvre'),
  ('Finitions', NULL, 'finitions'),
  ('Equipements techniques', NULL, 'equipements-techniques'),
  ('Demolition et preparation chantier', NULL, 'demolition-preparation'),
  ('Securite et videosurveillance', NULL, 'securite-videosurveillance')
ON CONFLICT (slug) DO NOTHING;

-- ── Niveau 2 : sous-catégories CITYMO ──
INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Maconnerie et structure', c.id, 'maconnerie-structure'
FROM public.categories c WHERE c.slug = 'gros-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Plomberie', c.id, 'plomberie'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Electricite', c.id, 'electricite'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Platrerie et plafonds BA13', c.id, 'platrerie-plafonds-ba13'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Menuiserie aluminium', c.id, 'menuiserie-aluminium'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Sanitaires', c.id, 'sanitaires'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Cloisons vitrees', c.id, 'cloisons-vitrees'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Carrelage', c.id, 'carrelage'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Parquet et revetements sol', c.id, 'parquet-revetements-sol'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Marbre et pierre', c.id, 'marbre-pierre'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Peinture et papier peint', c.id, 'peinture-papier-peint'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Faux plafonds Armstrong', c.id, 'faux-plafonds-armstrong'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Enduits et talochage', c.id, 'enduits-talochage'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Climatisation', c.id, 'climatisation'
FROM public.categories c WHERE c.slug = 'equipements-techniques'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Eclairage LED', c.id, 'eclairage-led'
FROM public.categories c WHERE c.slug = 'equipements-techniques'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Depose et demolition', c.id, 'depose-demolition'
FROM public.categories c WHERE c.slug = 'demolition-preparation'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Nettoyage chantier', c.id, 'nettoyage-chantier'
FROM public.categories c WHERE c.slug = 'demolition-preparation'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Videosurveillance HIKVISION', c.id, 'videosurveillance-hikvision'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Controle d''acces', c.id, 'controle-acces'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Reseau informatique', c.id, 'reseau-informatique'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;
