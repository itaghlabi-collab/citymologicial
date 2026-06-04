-- Supabase SQL Editor → Run (module Présence ouvriers)
-- Crée / met à jour public.attendance + colonnes projet + chef de chantier
-- Prérequis recommandés : employees (RH), workers (ouvriers), projects (projets)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Table attendance ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID,
  worker_id         UUID,
  project_id        UUID,
  date              DATE NOT NULL,
  statut            TEXT NOT NULL DEFAULT 'present',
  heure_entree      TIME,
  heure_sortie      TIME,
  chantier          TEXT,
  notes             TEXT,
  chef_chantier_id  UUID,
  chef_chantier_nom TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS employee_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS worker_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS chef_chantier_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS chef_chantier_nom TEXT;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_statut_check;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_statut_check
  CHECK (statut IN ('present', 'absent', 'retard', 'demi_journee', 'conge'));

DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Clés étrangères (si tables liées existent) ─────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_employee_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_employee_id_fkey
        FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_chef_chantier_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_chef_chantier_id_fkey
        FOREIGN KEY (chef_chantier_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_worker_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_worker_id_fkey
        FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_project_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_project_id ON public.attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_chantier ON public.attendance(chantier);
CREATE INDEX IF NOT EXISTS idx_attendance_statut ON public.attendance(statut);
CREATE INDEX IF NOT EXISTS idx_attendance_chef_chantier_id ON public.attendance(chef_chantier_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_all_auth ON public.attendance;
CREATE POLICY attendance_all_auth ON public.attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

SELECT 'attendance OK' AS status, COUNT(*) AS lignes FROM public.attendance;
