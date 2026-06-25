-- =============================================================================
-- CITYMO — Module Besoins + Demandes ressources (script complet, sans erreur)
-- Supabase → SQL Editor → New query → Run
-- Ré-exécutable (IF NOT EXISTS)
-- =============================================================================

-- ── 1. Tables Besoins chantier ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_staff_needs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fonction            TEXT NOT NULL,
  quantite_necessaire INT NOT NULL DEFAULT 1 CHECK (quantite_necessaire >= 0),
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, fonction)
);

CREATE TABLE IF NOT EXISTS public.project_equipment_needs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  equipement          TEXT NOT NULL,
  quantite_necessaire INT NOT NULL DEFAULT 1 CHECK (quantite_necessaire >= 0),
  quantite_disponible INT NOT NULL DEFAULT 0 CHECK (quantite_disponible >= 0),
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material_needs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  materiau            TEXT NOT NULL,
  quantite_necessaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite               TEXT DEFAULT 'u',
  devis_ref           TEXT,
  statut              TEXT NOT NULL DEFAULT 'prevu',
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Demandes de ressources RH ─────────────────────────────────────────────

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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resource_requests_statut_check CHECK (
    statut IN ('en_attente', 'en_cours', 'affectee', 'cloturee')
  )
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

-- ── 3. Index ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_staff_needs_project ON public.project_staff_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_needs_project ON public.project_equipment_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_material_needs_project ON public.project_material_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_project ON public.resource_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_statut ON public.resource_requests(statut);
CREATE INDEX IF NOT EXISTS idx_resource_request_history_request ON public.resource_request_history(request_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.project_staff_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_equipment_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_request_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_staff_needs_auth ON public.project_staff_needs;
CREATE POLICY project_staff_needs_auth ON public.project_staff_needs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_equipment_needs_auth ON public.project_equipment_needs;
CREATE POLICY project_equipment_needs_auth ON public.project_equipment_needs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_material_needs_auth ON public.project_material_needs;
CREATE POLICY project_material_needs_auth ON public.project_material_needs
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
GRANT ALL ON public.project_equipment_needs TO authenticated, service_role;
GRANT ALL ON public.project_material_needs TO authenticated, service_role;
GRANT ALL ON public.resource_requests TO authenticated, service_role;
GRANT ALL ON public.resource_request_workers TO authenticated, service_role;
GRANT ALL ON public.resource_request_history TO authenticated, service_role;

-- ── 5. Notifications (crée la table si absente + type resource_request) ───────

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

CREATE INDEX IF NOT EXISTS notifications_recipient_user_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx
  ON public.notifications (recipient_role, is_read, created_at DESC)
  WHERE recipient_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_user_idx
  ON public.notifications (recipient_user_id, entity_type, entity_id, type)
  WHERE recipient_user_id IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_role_idx
  ON public.notifications (recipient_role, entity_type, entity_id, type)
  WHERE recipient_user_id IS NULL
    AND recipient_role IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR (
      recipient_role IS NOT NULL
      AND lower(trim(recipient_role)) = lower(trim(COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()),
        ''
      )))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  );

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  )
  WITH CHECK (true);

GRANT ALL ON public.notifications TO authenticated, service_role;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
      'document', 'system', 'resource_request'
    )
  );

SELECT 'Module Besoins + notifications OK' AS status;
