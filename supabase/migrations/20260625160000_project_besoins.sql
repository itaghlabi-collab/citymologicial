-- Besoins chantier + demandes de ressources RH

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

CREATE INDEX IF NOT EXISTS idx_project_staff_needs_project ON public.project_staff_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_needs_project ON public.project_equipment_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_material_needs_project ON public.project_material_needs(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_project ON public.resource_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_statut ON public.resource_requests(statut);
CREATE INDEX IF NOT EXISTS idx_resource_request_history_request ON public.resource_request_history(request_id);

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check CHECK (
        type IN (
          'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
          'document', 'system', 'resource_request'
        )
      );
  END IF;
END $$;
