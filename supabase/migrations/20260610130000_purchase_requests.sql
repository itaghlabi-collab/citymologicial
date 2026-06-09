-- CITYMO — Achats : Demandes d'achat (purchase_requests)
-- Sans DROP / TRUNCATE / DELETE de données

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande             TEXT,
  titre                   TEXT NOT NULL,
  priorite                TEXT NOT NULL DEFAULT 'Normale',
  statut                  TEXT NOT NULL DEFAULT 'Brouillon',
  date_debut              DATE,
  date_limite             DATE,
  description             TEXT,
  department              TEXT NOT NULL DEFAULT 'ACHATS',
  project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref             TEXT,
  project_name            TEXT,
  assigned_employee_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_employee_name  TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS project_ref TEXT;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS project_name TEXT;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'ACHATS';

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS assigned_employee_name TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_statut
  ON public.purchase_requests (statut);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_project_id
  ON public.purchase_requests (project_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_department
  ON public.purchase_requests (department);

DROP TRIGGER IF EXISTS purchase_requests_updated_at ON public.purchase_requests;
CREATE TRIGGER purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_requests_select_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_select_auth ON public.purchase_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_requests_insert_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_insert_auth ON public.purchase_requests
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_requests_update_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_update_auth ON public.purchase_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_requests_delete_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_delete_auth ON public.purchase_requests
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.purchase_requests TO authenticated, service_role;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achat_purchase_requests'
  ) THEN
    INSERT INTO public.purchase_requests (
      ref_demande, titre, statut, date_debut, date_limite, description,
      department, project_name, assigned_employee_name, payload,
      created_by, created_at, updated_at
    )
    SELECT
      a.ref_demande,
      a.objet,
      a.statut,
      a.date_demande,
      NULL,
      a.notes,
      'ACHATS',
      a.projet_lie,
      a.demandeur,
      COALESCE(a.payload, '{}'::jsonb),
      a.created_by,
      a.created_at,
      a.updated_at
    FROM public.achat_purchase_requests a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_requests p
      WHERE p.ref_demande IS NOT NULL
        AND p.ref_demande = a.ref_demande
    );
  END IF;
END $migrate$;

NOTIFY pgrst, 'reload schema';
