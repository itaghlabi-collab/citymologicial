-- CITYMO — Couleur personnalisée par tâche planning (Gantt)
-- Idempotent — SQL Editor → Run

ALTER TABLE public.project_planning_tasks
  ADD COLUMN IF NOT EXISTS couleur TEXT;

COMMENT ON COLUMN public.project_planning_tasks.couleur IS 'Couleur hex (#RRGGBB) optionnelle pour la barre Gantt';
