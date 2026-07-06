-- =============================================================================
-- CITYMO — Projet > Besoins (RH + matériel) — SCRIPT COMPLET À COLLER DANS SUPABASE
-- Supabase → SQL Editor → New query → Coller tout → Run
-- Ré-exécutable (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Ordre : base → v2 RH → workflow → demandes chantier → équipe → achats → notifs
-- =============================================================================

-- ── 0. Prérequis minimaux ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) THEN
    RAISE EXCEPTION 'Table projects absente — exécutez d''abord les scripts Projets de base.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workers'
  ) THEN
    RAISE EXCEPTION 'Table workers absente — exécutez d''abord RUN_WORKERS ou migrations RH.';
  END IF;
END $$;

-- ── 1. Besoins RH projet (tables de base) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_staff_needs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fonction            TEXT NOT NULL,
  quantite_necessaire INT NOT NULL DEFAULT 1 CHECK (quantite_necessaire >= 0),
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.resource_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande         TEXT,
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_ref         TEXT,
  project_name        TEXT,
  fonction            TEXT NOT NULL,
  quantite            INT NOT NULL DEFAULT 1 CHECK (quantite > 0),
  date_souhaitee      DATE,
  priorite            TEXT NOT NULL DEFAULT 'Normale',
  commentaire         TEXT,
  statut              TEXT NOT NULL DEFAULT 'en_attente',
  requested_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_name   TEXT,
  assigned_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_name    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.resource_request_workers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES public.resource_requests(id) ON DELETE CASCADE,
  worker_id           UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.resource_request_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES public.resource_requests(id) ON DELETE CASCADE,
  action              TEXT NOT NULL,
  details             TEXT,
  actor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Besoins RH v2 (colonnes formulaire Projet > Besoins) ─────────────────

ALTER TABLE public.project_staff_needs DROP CONSTRAINT IF EXISTS project_staff_needs_project_id_fonction_key;

ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS ref_besoin TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS type_besoin TEXT NOT NULL DEFAULT 'Ouvriers';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS corps_metier TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS specialite TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS date_debut_souhaitee DATE;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS date_fin_estimee DATE;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS duree_prevue TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'Normale';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS responsable_demande TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS description_travaux TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS competences TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS epi_obligatoires TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'brouillon';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS resource_request_id UUID;

CREATE TABLE IF NOT EXISTS public.project_staff_need_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id     UUID NOT NULL REFERENCES public.project_staff_needs(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  details     TEXT,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS staff_need_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_staff_need_id_fkey') THEN
    ALTER TABLE public.resource_requests
      ADD CONSTRAINT resource_requests_staff_need_id_fkey
      FOREIGN KEY (staff_need_id) REFERENCES public.project_staff_needs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. Workflow RH (statuts + recrutement) ───────────────────────────────────

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS parent_request_id UUID;
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'ressource';
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS recruitment_statut TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_parent_request_id_fkey') THEN
    ALTER TABLE public.resource_requests
      ADD CONSTRAINT resource_requests_parent_request_id_fkey
      FOREIGN KEY (parent_request_id) REFERENCES public.resource_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_statut_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_statut_check CHECK (
  statut IN ('en_attente', 'en_cours', 'partielle', 'affectee', 'recrutement_en_cours', 'refusee', 'cloturee')
);

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_request_type_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_request_type_check CHECK (
  request_type IN ('ressource', 'recrutement')
);

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_recruitment_statut_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_recruitment_statut_check CHECK (
  recruitment_statut IS NULL OR recruitment_statut IN ('cree', 'en_recherche', 'entretien', 'valide', 'annule', 'cloture')
);

ALTER TABLE public.project_staff_needs DROP CONSTRAINT IF EXISTS project_staff_needs_statut_check;
ALTER TABLE public.project_staff_needs ADD CONSTRAINT project_staff_needs_statut_check CHECK (
  statut IN ('brouillon', 'soumis', 'en_recherche_rh', 'partiellement_couvert', 'couvert', 'refuse', 'annule', 'clos')
);

-- ── 4. Index RH ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_staff_needs_project ON public.project_staff_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_staff_needs_statut ON public.project_staff_needs(statut);
CREATE INDEX IF NOT EXISTS idx_project_staff_need_history_need ON public.project_staff_need_history(need_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_project ON public.resource_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_statut ON public.resource_requests(statut);
CREATE INDEX IF NOT EXISTS idx_resource_requests_parent ON public.resource_requests(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_resource_request_history_request ON public.resource_request_history(request_id);

-- ── 5. RLS RH ────────────────────────────────────────────────────────────────

ALTER TABLE public.project_staff_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff_need_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_request_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_staff_needs_auth ON public.project_staff_needs;
CREATE POLICY project_staff_needs_auth ON public.project_staff_needs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_staff_need_history_auth ON public.project_staff_need_history;
CREATE POLICY project_staff_need_history_auth ON public.project_staff_need_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS resource_requests_auth ON public.resource_requests;
CREATE POLICY resource_requests_auth ON public.resource_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS resource_request_workers_auth ON public.resource_request_workers;
CREATE POLICY resource_request_workers_auth ON public.resource_request_workers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS resource_request_history_auth ON public.resource_request_history;
CREATE POLICY resource_request_history_auth ON public.resource_request_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_staff_needs TO authenticated, service_role;
GRANT ALL ON public.project_staff_need_history TO authenticated, service_role;
GRANT ALL ON public.resource_requests TO authenticated, service_role;
GRANT ALL ON public.resource_request_workers TO authenticated, service_role;
GRANT ALL ON public.resource_request_history TO authenticated, service_role;

-- ── 6. Demandes chantier (Besoins matériel → Inventaire) ─────────────────────

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
  article_id            UUID,
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

-- FK article_id seulement si stock_articles existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_articles'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_material_request_lines_article_id_fkey'
  ) THEN
    ALTER TABLE public.site_material_request_lines
      ADD CONSTRAINT site_material_request_lines_article_id_fkey
      FOREIGN KEY (article_id) REFERENCES public.stock_articles(id) ON DELETE SET NULL;
  END IF;
END $$;

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

-- ── 7. Équipe projet (miroir ouvriers ↔ projet) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.worker_project_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'annulee')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wpa_worker_project_unique
  ON public.worker_project_assignments (worker_id, project_id);

ALTER TABLE public.worker_project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpa_auth ON public.worker_project_assignments;
CREATE POLICY wpa_auth ON public.worker_project_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.worker_project_assignments TO authenticated, service_role;

-- ── 8. Achats (rupture stock depuis demande chantier) ────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande             TEXT,
  titre                   TEXT NOT NULL DEFAULT 'Demande achat',
  priorite                TEXT NOT NULL DEFAULT 'Normale',
  statut                  TEXT NOT NULL DEFAULT 'Brouillon',
  date_debut              DATE,
  date_limite             DATE,
  description             TEXT,
  department              TEXT NOT NULL DEFAULT 'ACHATS',
  project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref             TEXT,
  project_name            TEXT,
  assigned_employee_id    UUID,
  assigned_employee_name  TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS site_material_request_id UUID
    REFERENCES public.site_material_requests(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS site_material_request_ref TEXT;

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_requests_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_auth ON public.purchase_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_requests TO authenticated, service_role;

-- ── 9. Notifications (types RH + chantier) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_role text,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'system',
  priority text NOT NULL DEFAULT 'normal',
  entity_type text,
  entity_id uuid,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  )
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR recipient_role IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (true);

GRANT ALL ON public.notifications TO authenticated, service_role;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
    'document', 'system', 'resource_request', 'site_material_request'
  )
);

-- ── 10. Recharger le cache API Supabase ──────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ── 11. Vérification ─────────────────────────────────────────────────────────

SELECT 'project_staff_needs' AS table_name,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_staff_needs')
    THEN 'OK' ELSE 'MANQUANT' END AS status
UNION ALL
SELECT 'project_staff_needs.type_besoin',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_staff_needs' AND column_name='type_besoin')
    THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'site_material_requests',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='site_material_requests')
    THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'worker_project_assignments',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='worker_project_assignments')
    THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'purchase_requests',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_requests')
    THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'notifications.site_material_request type',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'notifications' AND c.conname = 'notifications_type_check'
  ) THEN 'OK' ELSE 'MANQUANT' END;

SELECT '✅ Script Besoins Projet terminé — hard refresh (Cmd+Shift+R) sur l''app' AS message;
