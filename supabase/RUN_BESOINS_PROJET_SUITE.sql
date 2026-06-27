-- =============================================================================
-- CITYMO — SUITE du script Besoins Projet (si erreur ligne 342 = copie tronquée)
-- Exécutez ceci APRÈS les sections 1-7 déjà passées (worker_project_assignments OK)
-- Supabase → SQL Editor → New query → Run
-- =============================================================================

-- ── 8. Achats ────────────────────────────────────────────────────────────────

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'site_material_requests'
  ) THEN
    ALTER TABLE public.purchase_requests
      ADD COLUMN IF NOT EXISTS site_material_request_id UUID
        REFERENCES public.site_material_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS site_material_request_ref TEXT;

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_requests_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_auth ON public.purchase_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_requests TO authenticated, service_role;

-- ── 9. Notifications ─────────────────────────────────────────────────────────

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

NOTIFY pgrst, 'reload schema';

SELECT 'OK suite Besoins Projet' AS message;
