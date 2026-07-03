-- À exécuter dans Supabase SQL Editor
ALTER TABLE public.project_planning_tasks
  ADD COLUMN IF NOT EXISTS wbs_code TEXT;
