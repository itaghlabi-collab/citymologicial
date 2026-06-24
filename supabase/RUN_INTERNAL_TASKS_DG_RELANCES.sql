-- Relances Directeur sur tâches — historique (date, message, expéditeur)
-- Exécuter après RUN_INTERNAL_TASKS_ENHANCE.sql

CREATE TABLE IF NOT EXISTS public.internal_task_dg_relances (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
  sent_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message    TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_task_dg_relances_task_id
  ON public.internal_task_dg_relances (task_id, sent_at DESC);

ALTER TABLE public.internal_task_dg_relances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_task_dg_relances_auth ON public.internal_task_dg_relances;
CREATE POLICY internal_task_dg_relances_auth ON public.internal_task_dg_relances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.internal_task_dg_relances TO authenticated;
GRANT ALL ON public.internal_task_dg_relances TO service_role;

COMMENT ON TABLE public.internal_task_dg_relances IS 'Historique des relances Directeur sur les tâches internes';
