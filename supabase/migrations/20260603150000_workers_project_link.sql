ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_project_id_fkey') THEN
      ALTER TABLE public.workers
        ADD CONSTRAINT workers_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workers_project_id ON public.workers(project_id);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_project_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_project_id ON public.attendance(project_id);

NOTIFY pgrst, 'reload schema';
