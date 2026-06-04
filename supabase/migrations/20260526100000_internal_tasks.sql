-- Organisation interne — Tâches à faire
-- Coller ce fichier en entier dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.internal_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  description     TEXT,
  priorite        TEXT NOT NULL DEFAULT 'normale',
  statut          TEXT NOT NULL DEFAULT 'a_faire',
  responsable     TEXT,
  date_echeance   DATE,
  module_lie      TEXT,
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'a_faire';
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS date_echeance DATE;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS module_lie TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Migration anciennes valeurs (si table existait avec ancien schéma)
UPDATE public.internal_tasks SET statut = 'a_faire'   WHERE statut = 'todo';
UPDATE public.internal_tasks SET statut = 'en_cours'  WHERE statut = 'inprogress';
UPDATE public.internal_tasks SET statut = 'terminee'  WHERE statut = 'done';

ALTER TABLE public.internal_tasks DROP CONSTRAINT IF EXISTS internal_tasks_priorite_check;
ALTER TABLE public.internal_tasks
  ADD CONSTRAINT internal_tasks_priorite_check
  CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente'));

ALTER TABLE public.internal_tasks DROP CONSTRAINT IF EXISTS internal_tasks_statut_check;
ALTER TABLE public.internal_tasks
  ADD CONSTRAINT internal_tasks_statut_check
  CHECK (statut IN ('a_faire', 'en_cours', 'terminee'));

DROP TRIGGER IF EXISTS internal_tasks_updated_at ON public.internal_tasks;
CREATE TRIGGER internal_tasks_updated_at
  BEFORE UPDATE ON public.internal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_internal_tasks_statut ON public.internal_tasks(statut);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_priorite ON public.internal_tasks(priorite);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_responsable ON public.internal_tasks(responsable);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_date_echeance ON public.internal_tasks(date_echeance);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_created_at ON public.internal_tasks(created_at DESC);

ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_tasks_all_auth ON public.internal_tasks;
CREATE POLICY internal_tasks_all_auth ON public.internal_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.internal_tasks TO authenticated;
GRANT ALL ON public.internal_tasks TO service_role;
