-- Types d'intervention projet (multi-sélection)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS types_intervention TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.projects.types_intervention IS
  'Types d''intervention multi-sélection : TCE, Gros œuvre, Second œuvre';

CREATE INDEX IF NOT EXISTS idx_projects_types_intervention
  ON public.projects USING GIN (types_intervention);
