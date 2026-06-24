-- =============================================================================
-- CITYMO ERP — Planning chantier : WBS, ressources, jalons, collaboration
-- Exécuter APRÈS RUN_PROJECT_PLANNING_TASKS.sql — idempotent (ADD ONLY)
-- =============================================================================

-- Hiérarchie WBS (tâche parente)
ALTER TABLE public.project_planning_tasks
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.project_planning_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ppt_parent ON public.project_planning_tasks (parent_id);

-- Jalons projet
CREATE TABLE IF NOT EXISTS public.project_planning_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  date_jalon  DATE NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'a_venir'
    CHECK (statut IN ('a_venir', 'atteint', 'retarde', 'annule')),
  notes       TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppm_project ON public.project_planning_milestones (project_id, date_jalon);

-- Ressources planning (équipe / coûts)
CREATE TABLE IF NOT EXISTS public.project_planning_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id         UUID REFERENCES public.project_planning_tasks(id) ON DELETE SET NULL,
  nom             TEXT NOT NULL,
  email           TEXT,
  type_ressource  TEXT NOT NULL DEFAULT 'travail'
    CHECK (type_ressource IN ('travail', 'materiel', 'sous_traitance')),
  taux_horaire    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  heures_prevues  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppr_project ON public.project_planning_resources (project_id);

-- Collaboration — commentaires / suivi équipe
CREATE TABLE IF NOT EXISTS public.project_planning_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES public.project_planning_tasks(id) ON DELETE CASCADE,
  auteur      TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppc_project ON public.project_planning_comments (project_id, created_at DESC);

-- Triggers updated_at
DROP TRIGGER IF EXISTS ppm_updated_at ON public.project_planning_milestones;
CREATE TRIGGER ppm_updated_at
  BEFORE UPDATE ON public.project_planning_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS ppr_updated_at ON public.project_planning_resources;
CREATE TRIGGER ppr_updated_at
  BEFORE UPDATE ON public.project_planning_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.project_planning_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_planning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_planning_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppm_auth ON public.project_planning_milestones;
CREATE POLICY ppm_auth ON public.project_planning_milestones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ppr_auth ON public.project_planning_resources;
CREATE POLICY ppr_auth ON public.project_planning_resources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ppc_auth ON public.project_planning_comments;
CREATE POLICY ppc_auth ON public.project_planning_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_planning_tasks' AND column_name = 'parent_id') AS wbs_parent_ok,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_planning_milestones') AS milestones_ok,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_planning_resources') AS resources_ok,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_planning_comments') AS comments_ok;
