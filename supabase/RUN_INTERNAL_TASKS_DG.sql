-- =============================================================================
-- CITYMO ERP — Tâches DG (Direction Générale)
-- Exécuter dans Supabase SQL Editor — idempotent
--
-- Ajoute is_dg_task + created_by sur internal_tasks (aucune suppression).
-- =============================================================================

ALTER TABLE public.internal_tasks
  ADD COLUMN IF NOT EXISTS is_dg_task BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.internal_tasks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_tasks_is_dg_task
  ON public.internal_tasks (is_dg_task)
  WHERE is_dg_task = TRUE;

CREATE INDEX IF NOT EXISTS idx_internal_tasks_created_by
  ON public.internal_tasks (created_by)
  WHERE created_by IS NOT NULL;

COMMENT ON COLUMN public.internal_tasks.is_dg_task IS 'Tâche privée émise par la DG (visible créateur + assigné)';
COMMENT ON COLUMN public.internal_tasks.created_by IS 'Créateur auth.users (DG)';

NOTIFY pgrst, 'reload schema';

SELECT
  COUNT(*)::int AS total_tasks,
  COUNT(*) FILTER (WHERE is_dg_task)::int AS dg_tasks,
  COUNT(*) FILTER (WHERE NOT is_dg_task)::int AS normal_tasks
FROM public.internal_tasks;
