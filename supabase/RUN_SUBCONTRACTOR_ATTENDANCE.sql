-- =============================================================================
-- CITYMO — Présence sous-traitants (isolé)
-- Coller dans Supabase → SQL Editor → Run
-- NE TOUCHE PAS public.attendance (Présence ouvriers) ni les paiements ST.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.subcontractor_attendance (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date               DATE NOT NULL,
  statut             TEXT NOT NULL DEFAULT 'present'
    CHECK (statut IN ('present', 'absent')),
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subcontractor_attendance_date_sub_project_key
    UNIQUE (date, subcontractor_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_att_date
  ON public.subcontractor_attendance (date DESC);

CREATE INDEX IF NOT EXISTS idx_sub_att_sub
  ON public.subcontractor_attendance (subcontractor_id);

CREATE INDEX IF NOT EXISTS idx_sub_att_project
  ON public.subcontractor_attendance (project_id);

CREATE INDEX IF NOT EXISTS idx_sub_att_statut
  ON public.subcontractor_attendance (statut);

DROP TRIGGER IF EXISTS subcontractor_attendance_updated_at ON public.subcontractor_attendance;
CREATE TRIGGER subcontractor_attendance_updated_at
  BEFORE UPDATE ON public.subcontractor_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subcontractor_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subcontractor_attendance_auth ON public.subcontractor_attendance;
CREATE POLICY subcontractor_attendance_auth ON public.subcontractor_attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.subcontractor_attendance TO authenticated, service_role;

-- Permissions menu : mêmes rôles que « Sous-traitants »
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT DISTINCT rp.role_id, 'sous_traitants', 'presence-sous-traitants', a.code, true
FROM public.role_permissions rp
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(code)
WHERE rp.submodule_code = 'sous-traitants'
  AND rp.action_code = 'voir'
  AND rp.granted = true
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

NOTIFY pgrst, 'reload schema';
