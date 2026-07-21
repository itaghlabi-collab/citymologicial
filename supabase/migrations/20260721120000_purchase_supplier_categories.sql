-- CITYMO — Annuaire Fournisseurs Étape 1 : catégories (multi)
-- Additive / idempotent — aucun DROP destructif, aucune suppression de données fournisseurs.
-- Coller aussi via : supabase/RUN_PURCHASE_SUPPLIER_CATEGORIES.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Catalogue catégories ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_supplier_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.purchase_supplier_categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $uq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_supplier_categories_slug_key'
      AND conrelid = 'public.purchase_supplier_categories'::regclass
  ) THEN
    ALTER TABLE public.purchase_supplier_categories
      ADD CONSTRAINT purchase_supplier_categories_slug_key UNIQUE (slug);
  END IF;
END $uq$;

CREATE INDEX IF NOT EXISTS idx_purchase_supplier_categories_active
  ON public.purchase_supplier_categories (is_active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_purchase_supplier_categories_name_lower
  ON public.purchase_supplier_categories (lower(trim(name)));

DROP TRIGGER IF EXISTS purchase_supplier_categories_updated_at
  ON public.purchase_supplier_categories;
CREATE TRIGGER purchase_supplier_categories_updated_at
  BEFORE UPDATE ON public.purchase_supplier_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Liaison fournisseur ↔ catégories (1 primaire + N secondaires) ───────────
CREATE TABLE IF NOT EXISTS public.purchase_supplier_category_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES public.purchase_suppliers(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES public.purchase_supplier_categories(id) ON DELETE RESTRICT,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, category_id)
);

ALTER TABLE public.purchase_supplier_category_links
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.purchase_supplier_category_links
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pscl_supplier
  ON public.purchase_supplier_category_links (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pscl_category
  ON public.purchase_supplier_category_links (category_id);
CREATE INDEX IF NOT EXISTS idx_pscl_primary
  ON public.purchase_supplier_category_links (supplier_id)
  WHERE is_primary = TRUE;

-- Au plus une catégorie primaire par fournisseur
CREATE UNIQUE INDEX IF NOT EXISTS uq_pscl_one_primary_per_supplier
  ON public.purchase_supplier_category_links (supplier_id)
  WHERE is_primary = TRUE;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_category_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_supplier_categories_select_auth ON public.purchase_supplier_categories;
CREATE POLICY purchase_supplier_categories_select_auth ON public.purchase_supplier_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_supplier_categories_insert_auth ON public.purchase_supplier_categories;
CREATE POLICY purchase_supplier_categories_insert_auth ON public.purchase_supplier_categories
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_supplier_categories_update_auth ON public.purchase_supplier_categories;
CREATE POLICY purchase_supplier_categories_update_auth ON public.purchase_supplier_categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_supplier_categories_delete_auth ON public.purchase_supplier_categories;
CREATE POLICY purchase_supplier_categories_delete_auth ON public.purchase_supplier_categories
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_supplier_category_links_select_auth ON public.purchase_supplier_category_links;
CREATE POLICY purchase_supplier_category_links_select_auth ON public.purchase_supplier_category_links
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_supplier_category_links_insert_auth ON public.purchase_supplier_category_links;
CREATE POLICY purchase_supplier_category_links_insert_auth ON public.purchase_supplier_category_links
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_supplier_category_links_update_auth ON public.purchase_supplier_category_links;
CREATE POLICY purchase_supplier_category_links_update_auth ON public.purchase_supplier_category_links
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_supplier_category_links_delete_auth ON public.purchase_supplier_category_links;
CREATE POLICY purchase_supplier_category_links_delete_auth ON public.purchase_supplier_category_links
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.purchase_supplier_categories TO authenticated, service_role;
GRANT ALL ON public.purchase_supplier_category_links TO authenticated, service_role;

-- ── Seed catégories initiales (upsert par slug) ──────────────────────────────
INSERT INTO public.purchase_supplier_categories (name, slug, sort_order, is_active)
VALUES
  ('Matériaux de construction', 'materiaux-de-construction', 10, true),
  ('Gros œuvre', 'gros-oeuvre', 20, true),
  ('Second œuvre', 'second-oeuvre', 30, true),
  ('Électricité', 'electricite', 40, true),
  ('Courant fort', 'courant-fort', 50, true),
  ('Courant faible', 'courant-faible', 60, true),
  ('Domotique', 'domotique', 70, true),
  ('Plomberie', 'plomberie', 80, true),
  ('Climatisation & Ventilation (CVC)', 'climatisation-ventilation-cvc', 90, true),
  ('Chauffage', 'chauffage', 100, true),
  ('Désenfumage', 'desenfumage', 110, true),
  ('Protection incendie', 'protection-incendie', 120, true),
  ('Menuiserie Bois', 'menuiserie-bois', 130, true),
  ('Menuiserie Aluminium', 'menuiserie-aluminium', 140, true),
  ('Menuiserie PVC', 'menuiserie-pvc', 150, true),
  ('Menuiserie Métallique', 'menuiserie-metallique', 160, true),
  ('Serrurerie', 'serrurerie', 170, true),
  ('Ferronnerie', 'ferronnerie', 180, true),
  ('Vitrerie', 'vitrerie', 190, true),
  ('Miroiterie', 'miroiterie', 200, true),
  ('Carrelage', 'carrelage', 210, true),
  ('Marbre & Pierre', 'marbre-pierre', 220, true),
  ('Granit', 'granit', 230, true),
  ('Faux plafond', 'faux-plafond', 240, true),
  ('Cloisons sèches (BA13)', 'cloisons-seches-ba13', 250, true),
  ('Isolation thermique', 'isolation-thermique', 260, true),
  ('Isolation acoustique', 'isolation-acoustique', 270, true),
  ('Peinture', 'peinture', 280, true),
  ('Étanchéité', 'etancheite', 290, true),
  ('Revêtement de sol', 'revetement-de-sol', 300, true),
  ('Parquet', 'parquet', 310, true),
  ('Moquette', 'moquette', 320, true),
  ('Résine de sol', 'resine-de-sol', 330, true),
  ('Sanitaire', 'sanitaire', 340, true),
  ('Robinetterie', 'robinetterie', 350, true),
  ('Quincaillerie', 'quincaillerie', 360, true),
  ('Outillage', 'outillage', 370, true),
  ('Équipements de chantier', 'equipements-de-chantier', 380, true),
  ('Location matériel', 'location-materiel', 390, true),
  ('Échafaudage', 'echafaudage', 400, true),
  ('Nacelles', 'nacelles', 410, true),
  ('Engins & Terrassement', 'engins-terrassement', 420, true),
  ('Levage & Manutention', 'levage-manutention', 430, true),
  ('Béton & Préfabriqués', 'beton-prefabriques', 440, true),
  ('Centrale à béton', 'centrale-a-beton', 450, true),
  ('Acier & Métallurgie', 'acier-metallurgie', 460, true),
  ('Fer à béton', 'fer-a-beton', 470, true),
  ('Charpente métallique', 'charpente-metallique', 480, true),
  ('Signalisation & Sécurité', 'signalisation-securite', 490, true),
  ('Équipements de protection individuelle', 'equipements-de-protection-individuelle', 500, true),
  ('Gardiennage', 'gardiennage', 510, true),
  ('Mobilier', 'mobilier', 520, true),
  ('Mobilier de bureau', 'mobilier-de-bureau', 530, true),
  ('Mobilier sur mesure', 'mobilier-sur-mesure', 540, true),
  ('Décoration', 'decoration', 550, true),
  ('Accessoires décoratifs', 'accessoires-decoratifs', 560, true),
  ('Éclairage', 'eclairage', 570, true),
  ('Éclairage technique', 'eclairage-technique', 580, true),
  ('Éclairage décoratif', 'eclairage-decoratif', 590, true),
  ('Informatique', 'informatique', 600, true),
  ('Réseaux & Télécom', 'reseaux-telecom', 610, true),
  ('Audiovisuel', 'audiovisuel', 620, true),
  ('Contrôle d’accès', 'controle-d-acces', 630, true),
  ('Vidéosurveillance', 'videosurveillance', 640, true),
  ('Fournitures de bureau', 'fournitures-de-bureau', 650, true),
  ('Impression & Signalétique', 'impression-signaletique', 660, true),
  ('Nettoyage', 'nettoyage', 670, true),
  ('Produits d’entretien', 'produits-d-entretien', 680, true),
  ('Désinfection', 'desinfection', 690, true),
  ('Transport & Logistique', 'transport-logistique', 700, true),
  ('Livraison', 'livraison', 710, true),
  ('Déménagement', 'demenagement', 720, true),
  ('Stockage', 'stockage', 730, true),
  ('Laboratoire & Contrôle qualité', 'laboratoire-controle-qualite', 740, true),
  ('Bureau de contrôle', 'bureau-de-controle', 750, true),
  ('Topographie', 'topographie', 760, true),
  ('Géotechnique', 'geotechnique', 770, true),
  ('Études techniques', 'etudes-techniques', 780, true),
  ('Architecture', 'architecture', 790, true),
  ('Bureau d’études', 'bureau-d-etudes', 800, true),
  ('Impression de plans', 'impression-de-plans', 810, true),
  ('Gestion des déchets', 'gestion-des-dechets', 820, true),
  ('Espaces verts', 'espaces-verts', 830, true),
  ('Piscine', 'piscine', 840, true),
  ('Cuisine professionnelle', 'cuisine-professionnelle', 850, true),
  ('Équipements hôteliers', 'equipements-hoteliers', 860, true),
  ('Équipements de restauration', 'equipements-de-restauration', 870, true),
  ('Électroménager', 'electromenager', 880, true),
  ('Textile professionnel', 'textile-professionnel', 890, true),
  ('Uniformes & EPI', 'uniformes-epi', 900, true),
  ('Fournitures industrielles', 'fournitures-industrielles', 910, true),
  ('Maintenance', 'maintenance', 920, true),
  ('Réparation', 'reparation', 930, true),
  ('SAV technique', 'sav-technique', 940, true),
  ('Sous-traitance', 'sous-traitance', 950, true),
  ('Main-d’œuvre spécialisée', 'main-d-oeuvre-specialisee', 960, true),
  ('Divers', 'divers', 970, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ── Backfill soft depuis supplier_category (texte legacy) ─────────────────────
-- Mapping des anciennes valeurs UI → nouvelles catégories
WITH map AS (
  SELECT * FROM (VALUES
    ('Matériaux', 'materiaux-de-construction'),
    ('Équipements', 'equipements-de-chantier'),
    ('Services', 'divers'),
    ('Fournitures', 'fournitures-industrielles'),
    ('Transport', 'transport-logistique'),
    ('Sous-traitance', 'sous-traitance'),
    ('Informatique', 'informatique'),
    ('Autre', 'divers')
  ) AS t(legacy, slug)
),
matched AS (
  SELECT
    s.id AS supplier_id,
    c.id AS category_id
  FROM public.purchase_suppliers s
  JOIN map m ON lower(trim(s.supplier_category)) = lower(m.legacy)
  JOIN public.purchase_supplier_categories c ON c.slug = m.slug
  WHERE s.supplier_category IS NOT NULL AND trim(s.supplier_category) <> ''
)
INSERT INTO public.purchase_supplier_category_links (supplier_id, category_id, is_primary)
SELECT supplier_id, category_id, TRUE
FROM matched
ON CONFLICT (supplier_id, category_id) DO UPDATE SET is_primary = TRUE;

-- Aussi : match exact sur le nouveau libellé déjà saisi
INSERT INTO public.purchase_supplier_category_links (supplier_id, category_id, is_primary)
SELECT s.id, c.id, TRUE
FROM public.purchase_suppliers s
JOIN public.purchase_supplier_categories c
  ON lower(trim(c.name)) = lower(trim(s.supplier_category))
WHERE s.supplier_category IS NOT NULL AND trim(s.supplier_category) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_category_links l
    WHERE l.supplier_id = s.id AND l.is_primary = TRUE
  )
ON CONFLICT (supplier_id, category_id) DO UPDATE SET is_primary = TRUE;

SELECT 'purchase_supplier_categories OK' AS status;
