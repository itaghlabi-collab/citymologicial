-- ═══════════════════════════════════════════════════════════════════════════
-- CITYMO — Module PRÉSENCE (tout-en-un)
-- Supabase → SQL Editor → coller tout → Run
-- Résultat attendu : attendance OK | workers OK
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Ouvriers (si pas encore créés) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_cin          TEXT UNIQUE,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  telephone           TEXT,
  fonction            TEXT,
  specialite          TEXT,
  tarif               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  statut              TEXT NOT NULL DEFAULT 'actif',
  chantier            TEXT,
  project_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS project_id UUID;

DROP TRIGGER IF EXISTS workers_updated_at ON public.workers;
CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workers_select_auth ON public.workers;
CREATE POLICY workers_select_auth ON public.workers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS workers_insert_auth ON public.workers;
CREATE POLICY workers_insert_auth ON public.workers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS workers_update_auth ON public.workers;
CREATE POLICY workers_update_auth ON public.workers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS workers_delete_auth ON public.workers;
CREATE POLICY workers_delete_auth ON public.workers FOR DELETE TO authenticated USING (true);

-- ─── Présence attendance ────────────────────────────────────────────────────
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_chef_chantier_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_chef_chantier_id_fkey
        FOREIGN KEY (chef_chantier_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_worker_id_fkey') THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_project_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_project_id_fkey') THEN
      ALTER TABLE public.workers
        ADD CONSTRAINT workers_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_project_id ON public.attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_chef_chantier_id ON public.attendance(chef_chantier_id);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_all_auth ON public.attendance;
CREATE POLICY attendance_all_auth ON public.attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

SELECT 'workers OK' AS check_workers, COUNT(*) AS nb_ouvriers FROM public.workers;
SELECT 'attendance OK' AS check_presence, COUNT(*) AS nb_presences FROM public.attendance;
