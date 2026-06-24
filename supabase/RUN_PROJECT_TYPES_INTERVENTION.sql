-- =============================================================================
-- CITYMO ERP — Types d'intervention projet (TCE, Gros œuvre, Second œuvre)
-- Exécuter dans Supabase SQL Editor — idempotent (ADD ONLY)
-- Les projets existants conservent types_intervention vide (NULL / {}).
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS types_intervention TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.projects.types_intervention IS
  'Types d''intervention multi-sélection : TCE, Gros œuvre, Second œuvre';

CREATE INDEX IF NOT EXISTS idx_projects_types_intervention
  ON public.projects USING GIN (types_intervention);

NOTIFY pgrst, 'reload schema';

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'types_intervention'
  ) AS types_intervention_ok,
  (SELECT COUNT(*)::int FROM public.projects) AS total_projets,
  (SELECT COUNT(*)::int FROM public.projects WHERE types_intervention IS NOT NULL AND cardinality(types_intervention) > 0) AS projets_avec_type;
