-- Planning chantier projet (Gantt)

CREATE TABLE IF NOT EXISTS public.project_planning_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  nom             TEXT NOT NULL,
  lot             TEXT,
  date_debut      DATE,
  date_fin        DATE,
  duree_jours     INTEGER NOT NULL DEFAULT 1 CHECK (duree_jours >= 0),
  responsable     TEXT,
  avancement      NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (avancement >= 0 AND avancement <= 100),
  statut          TEXT NOT NULL DEFAULT 'a_faire'
    CHECK (statut IN ('a_faire', 'en_cours', 'bloque', 'termine')),
  notes           TEXT,
  predecessor_id  UUID REFERENCES public.project_planning_tasks(id) ON DELETE SET NULL,
  ordre           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppt_project ON public.project_planning_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_ppt_project_dates ON public.project_planning_tasks (project_id, date_debut, date_fin);

ALTER TABLE public.project_planning_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppt_auth ON public.project_planning_tasks;
CREATE POLICY ppt_auth ON public.project_planning_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
