-- Déprécié : utilisez plutôt supabase/RUN_ATTENDANCE_NOW.sql (tout-en-un)

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS chef_chantier_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS chef_chantier_nom TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_chef_chantier_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_chef_chantier_id_fkey
        FOREIGN KEY (chef_chantier_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_chef_chantier_id ON public.attendance(chef_chantier_id);

NOTIFY pgrst, 'reload schema';
