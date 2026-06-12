-- =============================================================================
-- CITYMO — Tâches à faire : statuts étendus + Push DG
-- Coller dans Supabase → SQL Editor → Run (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- Colonnes Push DG
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS dg_push BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS pushed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS dg_note TEXT;

-- Étendre les statuts
UPDATE public.internal_tasks SET statut = 'a_faire'  WHERE statut IN ('todo', 'à faire', 'a faire');
UPDATE public.internal_tasks SET statut = 'en_cours' WHERE statut IN ('inprogress', 'in_progress');
UPDATE public.internal_tasks SET statut = 'terminee' WHERE statut IN ('done', 'terminée', 'termine');
UPDATE public.internal_tasks SET statut = 'en_attente' WHERE statut IN ('waiting', 'en attente', 'pending');
UPDATE public.internal_tasks SET statut = 'annulee'   WHERE statut IN ('cancelled', 'canceled', 'annulée', 'annule');

ALTER TABLE public.internal_tasks DROP CONSTRAINT IF EXISTS internal_tasks_statut_check;
ALTER TABLE public.internal_tasks
  ADD CONSTRAINT internal_tasks_statut_check
  CHECK (statut IN ('a_faire', 'en_cours', 'en_attente', 'terminee', 'annulee'));

CREATE INDEX IF NOT EXISTS idx_internal_tasks_dg_push
  ON public.internal_tasks (dg_push DESC, pushed_at DESC NULLS LAST)
  WHERE dg_push = TRUE;

CREATE INDEX IF NOT EXISTS idx_internal_tasks_statut_ext
  ON public.internal_tasks (statut);

NOTIFY pgrst, 'reload schema';

SELECT
  COUNT(*)::int AS total_tasks,
  COUNT(*) FILTER (WHERE dg_push)::int AS dg_push_active,
  COUNT(*) FILTER (WHERE statut = 'en_attente')::int AS en_attente
FROM public.internal_tasks;
