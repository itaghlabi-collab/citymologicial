-- CITYMO — Demandes chantier — exécuter dans Supabase SQL Editor
-- (copie de supabase/migrations/20260626120000_site_material_requests.sql)

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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_material_requests_statut_check CHECK (
    statut IN (
      'brouillon', 'soumise', 'en_preparation', 'preparation_partielle',
      'en_attente_dg', 'validee_dg', 'prete', 'livree', 'annulee'
    )
  ),
  CONSTRAINT site_material_requests_priorite_check CHECK (
    priorite IN ('Normale', 'Urgente', 'Critique')
  )
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
CREATE INDEX IF NOT EXISTS idx_site_mat_req_date ON public.site_material_requests(date_demande DESC);
CREATE INDEX IF NOT EXISTS idx_site_mat_req_lines_request ON public.site_material_request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_site_mat_req_history_request ON public.site_material_request_history(request_id);

ALTER TABLE public.site_material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_material_requests_auth ON public.site_material_requests;
CREATE POLICY site_material_requests_auth ON public.site_material_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_material_request_lines_auth ON public.site_material_request_lines;
CREATE POLICY site_material_request_lines_auth ON public.site_material_request_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_material_request_history_auth ON public.site_material_request_history;
CREATE POLICY site_material_request_history_auth ON public.site_material_request_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.site_material_requests TO authenticated, service_role;
GRANT ALL ON public.site_material_request_lines TO authenticated, service_role;
GRANT ALL ON public.site_material_request_history TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
      type IN (
        'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
        'document', 'system', 'resource_request', 'site_material_request'
      )
    );
  END IF;
END $$;

SELECT 'site_material_requests OK' AS status;
