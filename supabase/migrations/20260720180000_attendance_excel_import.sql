-- Import pointage Excel — historique + traçabilité
-- Idempotent : relançable sans erreur, sans DROP, sans suppression de données.
-- À coller intégralement dans le SQL Editor Supabase.

-- ─── Table historique ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_excel_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL,
  file_name TEXT,
  week_debut DATE,
  week_fin DATE,
  imported_by UUID REFERENCES auth.users(id),
  imported_by_label TEXT,
  statut TEXT NOT NULL DEFAULT 'Analyse',
  worker_count INT NOT NULL DEFAULT 0,
  presence_count INT NOT NULL DEFAULT 0,
  overtime_count INT NOT NULL DEFAULT 0,
  ignored_count INT NOT NULL DEFAULT 0,
  anomalies JSONB DEFAULT jsonb_build_array(),
  sites JSONB DEFAULT jsonb_build_array(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes si table déjà créée dans une version antérieure
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS week_debut DATE;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS week_fin DATE;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS imported_by UUID;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS imported_by_label TEXT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS statut TEXT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS worker_count INT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS presence_count INT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS overtime_count INT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS ignored_count INT;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS anomalies JSONB;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS sites JSONB;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.attendance_excel_imports
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Contrainte UNIQUE sur ref (sans DROP)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_excel_imports_ref_key'
      AND conrelid = 'public.attendance_excel_imports'::regclass
  ) THEN
    ALTER TABLE public.attendance_excel_imports
      ADD CONSTRAINT attendance_excel_imports_ref_key UNIQUE (ref);
  END IF;
END $$;

-- Contrainte CHECK statut (sans DROP)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_excel_imports_statut_check'
      AND conrelid = 'public.attendance_excel_imports'::regclass
  ) THEN
    ALTER TABLE public.attendance_excel_imports
      ADD CONSTRAINT attendance_excel_imports_statut_check
      CHECK (statut IN (
        'Analyse',
        'A corriger',
        'Valide',
        'Importe',
        'Annule',
        'À corriger',
        'Validé',
        'Importé',
        'Annulé'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_excel_imports_ref
  ON public.attendance_excel_imports (ref);
CREATE INDEX IF NOT EXISTS idx_attendance_excel_imports_week
  ON public.attendance_excel_imports (week_debut DESC);

-- ─── Traçabilité présences ────────────────────────────────────────────────
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS import_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_import_batch_id_fkey'
      AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_import_batch_id_fkey
      FOREIGN KEY (import_batch_id)
      REFERENCES public.attendance_excel_imports(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_import_batch
  ON public.attendance (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ─── Traçabilité heures supplémentaires ───────────────────────────────────
ALTER TABLE public.overtime
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE public.overtime
  ADD COLUMN IF NOT EXISTS import_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'overtime_import_batch_id_fkey'
      AND conrelid = 'public.overtime'::regclass
  ) THEN
    ALTER TABLE public.overtime
      ADD CONSTRAINT overtime_import_batch_id_fkey
      FOREIGN KEY (import_batch_id)
      REFERENCES public.attendance_excel_imports(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_overtime_import_batch
  ON public.overtime (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ─── Traçabilité paie ─────────────────────────────────────────────────────
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS import_source TEXT;
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS import_ref TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_import_batch_id_fkey'
      AND conrelid = 'public.payroll'::regclass
  ) THEN
    ALTER TABLE public.payroll
      ADD CONSTRAINT payroll_import_batch_id_fkey
      FOREIGN KEY (import_batch_id)
      REFERENCES public.attendance_excel_imports(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_import_batch
  ON public.payroll (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ─── RLS + policy (création seule si absente, aucun DROP) ─────────────────
ALTER TABLE public.attendance_excel_imports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_excel_imports'
      AND policyname = 'attendance_excel_imports_all_auth'
  ) THEN
    CREATE POLICY attendance_excel_imports_all_auth
      ON public.attendance_excel_imports
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

SELECT 'attendance_excel_imports OK — script idempotent' AS status;
