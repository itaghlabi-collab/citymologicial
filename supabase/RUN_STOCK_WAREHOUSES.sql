-- CITYMO — Emplacements de stock (stock_warehouses)
-- À exécuter dans Supabase → SQL Editor (une seule fois, ou re-exécutable sans risque)

-- ── Fonction updated_at (si absente) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── Table emplacements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  type_depot      TEXT DEFAULT 'Autre',
  projet_lie      TEXT,
  adresse         TEXT,
  responsable     TEXT,
  statut          TEXT NOT NULL DEFAULT 'Actif',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_warehouses
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'Actif';

-- Unicité du nom (insensible à la casse)
CREATE UNIQUE INDEX IF NOT EXISTS stock_warehouses_nom_unique
  ON public.stock_warehouses (lower(trim(nom)));

CREATE INDEX IF NOT EXISTS idx_stock_warehouses_type_depot
  ON public.stock_warehouses (type_depot);

CREATE INDEX IF NOT EXISTS idx_stock_warehouses_statut
  ON public.stock_warehouses (statut);

-- Trigger updated_at
DROP TRIGGER IF EXISTS stock_warehouses_updated_at ON public.stock_warehouses;
CREATE TRIGGER stock_warehouses_updated_at
  BEFORE UPDATE ON public.stock_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_warehouses_all_auth ON public.stock_warehouses;
CREATE POLICY stock_warehouses_all_auth
  ON public.stock_warehouses
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.stock_warehouses TO authenticated;
GRANT ALL ON public.stock_warehouses TO service_role;

-- ── Colonne emplacement sur articles (si module stock déjà partiel) ───────────
ALTER TABLE public.stock_articles
  ADD COLUMN IF NOT EXISTS emplacement TEXT;

-- ── Seed : emplacements CITYMO par défaut (uniquement si table vide) ─────────
INSERT INTO public.stock_warehouses (nom, type_depot)
SELECT v.nom, v.type_depot
FROM (
  VALUES
    ('DEPOT LAKHYAYTA',              'Dépôt'),
    ('CHANTIER LONGOMETAL',          'Chantier'),
    ('ATELIER MENUISERIE',           'Atelier'),
    ('SAV HOUCINE HEZGUIT',          'SAV'),
    ('CHANTIER ALCOTT',              'Chantier'),
    ('CHANTIER ONDA',                'Chantier'),
    ('CHANTIER LOGIPARC',            'Chantier'),
    ('CHANTIER VILLA POLO',          'Chantier'),
    ('CHANTIER VILLA BENSOUDA',      'Chantier'),
    ('CHANTIER VILLA BOUSKOURA',     'Chantier'),
    ('CHANTIER MEDAFRICA BELVEDER',  'Chantier'),
    ('ATELIER D''ALUMINIUM',         'Atelier'),
    ('ATELIER DE FERRONNERIE',       'Atelier'),
    ('BUREAU CITYMO BD MED 5',       'Bureau')
) AS v(nom, type_depot)
WHERE NOT EXISTS (SELECT 1 FROM public.stock_warehouses LIMIT 1)
ON CONFLICT DO NOTHING;

-- ── Vérification ─────────────────────────────────────────────────────────────
SELECT
  'stock_warehouses' AS table_name,
  COUNT(*)::int AS nb_emplacements,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'VIDE' END AS statut
FROM public.stock_warehouses;

SELECT nom, type_depot, statut, created_at
FROM public.stock_warehouses
ORDER BY nom;
