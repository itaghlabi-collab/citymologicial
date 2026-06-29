-- =============================================================================
-- CITYMO — Inventaire & Dépôt + scan douchette (HID)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : ré-exécutable sans supprimer de données
-- Ordre : catégories → emplacements → articles/niveaux → scan → demandes chantier
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ═══ 1) CATÉGORIES + table articles de base ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS public.stock_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT,
  description     TEXT,
  statut          TEXT DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS legacy_id INTEGER;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS stock_type TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.stock_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

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
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS article_type TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS numero_serie TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS etat TEXT DEFAULT 'Neuf';
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS emplacement TEXT;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS default_warehouse_id UUID;
ALTER TABLE public.stock_articles ADD COLUMN IF NOT EXISTS default_project_id UUID;

-- ═══ 2) EMPLACEMENTS (stock_warehouses) ═════════════════════════════════════
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

ALTER TABLE public.stock_warehouses ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'Actif';

CREATE UNIQUE INDEX IF NOT EXISTS stock_warehouses_nom_unique
  ON public.stock_warehouses (lower(trim(nom)));

DROP TRIGGER IF EXISTS stock_warehouses_updated_at ON public.stock_warehouses;
CREATE TRIGGER stock_warehouses_updated_at
  BEFORE UPDATE ON public.stock_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

-- ═══ 3) NIVEAUX DE STOCK ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.stock_levels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES public.stock_articles(id) ON DELETE CASCADE,
  warehouse_id    UUID REFERENCES public.stock_warehouses(id) ON DELETE SET NULL,
  project_id      UUID,
  emplacement     TEXT,
  quantite        NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_article_id ON public.stock_levels (article_id);
CREATE INDEX IF NOT EXISTS idx_stock_articles_reference ON public.stock_articles (reference);

-- ═══ 4) MOUVEMENTS DE STOCK ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_mouvement   TEXT,
  type_mouvement  TEXT NOT NULL DEFAULT 'Entree',
  article_id      UUID REFERENCES public.stock_articles(id) ON DELETE SET NULL,
  warehouse_id    UUID REFERENCES public.stock_warehouses(id) ON DELETE SET NULL,
  quantite        NUMERIC(14,3) NOT NULL DEFAULT 0,
  date_mouvement  DATE NOT NULL DEFAULT CURRENT_DATE,
  motif           TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON public.stock_movements (ref_mouvement);
CREATE INDEX IF NOT EXISTS idx_stock_movements_article ON public.stock_movements (article_id);

-- ═══ 5) SCAN DOUCHETTE — Code128 / QR ═══════════════════════════════════════
ALTER TABLE public.stock_articles
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'Disponible';

UPDATE public.stock_articles
SET barcode_value = trim(reference)
WHERE (barcode_value IS NULL OR trim(barcode_value) = '')
  AND reference IS NOT NULL AND trim(reference) <> '';

UPDATE public.stock_articles
SET current_state = 'Disponible'
WHERE current_state IS NULL OR trim(current_state) = '';

CREATE UNIQUE INDEX IF NOT EXISTS stock_articles_barcode_value_unique
  ON public.stock_articles (lower(trim(barcode_value)))
  WHERE barcode_value IS NOT NULL AND trim(barcode_value) <> '';

CREATE INDEX IF NOT EXISTS idx_stock_articles_barcode_value ON public.stock_articles (barcode_value);
CREATE INDEX IF NOT EXISTS idx_stock_articles_reference_lower ON public.stock_articles (lower(trim(reference)));
CREATE INDEX IF NOT EXISTS idx_stock_articles_last_scanned_at ON public.stock_articles (last_scanned_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_stock_articles_current_state ON public.stock_articles (current_state);

-- ═══ 6) DEMANDES CHANTIER ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.site_material_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande         TEXT NOT NULL UNIQUE,
  project_id          UUID,
  project_ref         TEXT,
  project_name        TEXT,
  client_name         TEXT,
  chef_projet         TEXT,
  chef_chantier       TEXT,
  date_demande        DATE NOT NULL DEFAULT CURRENT_DATE,
  date_souhaitee      DATE,
  priorite            TEXT NOT NULL DEFAULT 'Normale',
  observation         TEXT,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  requires_dg         BOOLEAN NOT NULL DEFAULT FALSE,
  movement_ref        TEXT,
  montant_estime      NUMERIC(14,2) NOT NULL DEFAULT 0,
  requested_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_name   TEXT,
  prepared_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_by_name    TEXT,
  validated_dg_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_dg_name   TEXT,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_material_request_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID NOT NULL REFERENCES public.site_material_requests(id) ON DELETE CASCADE,
  category_id           TEXT NOT NULL,
  article_name          TEXT NOT NULL,
  article_id            UUID REFERENCES public.stock_articles(id) ON DELETE SET NULL,
  quantite_demandee     NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantite_preparee     NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantite_livree       NUMERIC(12,3) NOT NULL DEFAULT 0,
  unite                 TEXT NOT NULL DEFAULT 'u',
  remarque              TEXT,
  remarque_magasinier   TEXT,
  stock_actuel          NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_reserve         NUMERIC(12,3) NOT NULL DEFAULT 0,
  disponible            BOOLEAN NOT NULL DEFAULT TRUE,
  rupture               BOOLEAN NOT NULL DEFAULT FALSE,
  replaced_by           TEXT,
  is_custom             BOOLEAN NOT NULL DEFAULT FALSE,
  line_order            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_material_request_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.site_material_requests(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  details         TEXT,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  actor_role      TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_mat_req_project ON public.site_material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_site_mat_req_statut ON public.site_material_requests(statut);
CREATE INDEX IF NOT EXISTS idx_site_mat_req_lines_request ON public.site_material_request_lines(request_id);

-- ═══ 7) RLS + DROITS ════════════════════════════════════════════════════════
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_categories_select_auth ON public.stock_categories;
CREATE POLICY stock_categories_select_auth ON public.stock_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stock_articles_all_auth ON public.stock_articles;
CREATE POLICY stock_articles_all_auth ON public.stock_articles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stock_warehouses_all_auth ON public.stock_warehouses;
CREATE POLICY stock_warehouses_all_auth ON public.stock_warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stock_levels_all_auth ON public.stock_levels;
CREATE POLICY stock_levels_all_auth ON public.stock_levels FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stock_movements_all_auth ON public.stock_movements;
CREATE POLICY stock_movements_all_auth ON public.stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_material_requests_auth ON public.site_material_requests;
CREATE POLICY site_material_requests_auth ON public.site_material_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_material_request_lines_auth ON public.site_material_request_lines;
CREATE POLICY site_material_request_lines_auth ON public.site_material_request_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_material_request_history_auth ON public.site_material_request_history;
CREATE POLICY site_material_request_history_auth ON public.site_material_request_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.stock_categories TO authenticated, service_role;
GRANT ALL ON public.stock_articles TO authenticated, service_role;
GRANT ALL ON public.stock_warehouses TO authenticated, service_role;
GRANT ALL ON public.stock_levels TO authenticated, service_role;
GRANT ALL ON public.stock_movements TO authenticated, service_role;
GRANT ALL ON public.site_material_requests TO authenticated, service_role;
GRANT ALL ON public.site_material_request_lines TO authenticated, service_role;
GRANT ALL ON public.site_material_request_history TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══ 8) VÉRIFICATION ════════════════════════════════════════════════════════
SELECT 'stock_categories' AS table_name, COUNT(*)::int AS lignes FROM public.stock_categories
UNION ALL SELECT 'stock_articles', COUNT(*)::int FROM public.stock_articles
UNION ALL SELECT 'stock_warehouses', COUNT(*)::int FROM public.stock_warehouses
UNION ALL SELECT 'stock_levels', COUNT(*)::int FROM public.stock_levels
UNION ALL SELECT 'stock_movements', COUNT(*)::int FROM public.stock_movements
UNION ALL SELECT 'site_material_requests', COUNT(*)::int FROM public.site_material_requests;

SELECT
  COUNT(*)::int AS total_articles,
  COUNT(*) FILTER (WHERE barcode_value IS NOT NULL AND trim(barcode_value) <> '')::int AS avec_code_barres,
  COUNT(*) FILTER (WHERE last_scanned_at IS NOT NULL)::int AS deja_scannes
FROM public.stock_articles;
