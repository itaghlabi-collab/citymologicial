-- =============================================================================
-- CITYMO ERP — Affectation ouvriers externes ↔ projets (many-to-many)
-- Exécuter dans Supabase SQL Editor — idempotent (ADD ONLY)
--
-- Conserve workers.project_id (legacy). Migre les affectations existantes
-- vers worker_project_assignments.
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_wpa_project
  ON public.worker_project_assignments (project_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_wpa_worker
  ON public.worker_project_assignments (worker_id)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS wpa_updated_at ON public.worker_project_assignments;
CREATE TRIGGER wpa_updated_at
  BEFORE UPDATE ON public.worker_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrer workers.project_id → junction (sans supprimer la colonne legacy)
INSERT INTO public.worker_project_assignments (worker_id, project_id, status)
SELECT w.id, w.project_id, 'active'
FROM public.workers w
WHERE w.project_id IS NOT NULL
ON CONFLICT (worker_id, project_id) DO NOTHING;

ALTER TABLE public.worker_project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpa_auth ON public.worker_project_assignments;
CREATE POLICY wpa_auth ON public.worker_project_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.worker_project_assignments IS 'Affectation N-N ouvriers externes / projets';

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT COUNT(*)::int FROM public.worker_project_assignments WHERE status = 'active') AS affectations_actives,
  (SELECT COUNT(*)::int FROM public.workers WHERE project_id IS NOT NULL) AS ouvriers_legacy_project_id;
