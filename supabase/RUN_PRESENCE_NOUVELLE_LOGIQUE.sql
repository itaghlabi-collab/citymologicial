-- =============================================================================
-- CITYMO ERP — Présence nouvelle logique projet (script tout-en-un)
-- Supabase Dashboard → SQL Editor → coller tout → Run
-- Idempotent (ADD ONLY) — safe à relancer
--
-- ORDRE :
--   1. Affectations ouvriers ↔ projets (worker_project_assignments)
--   2. Archivage présences ancienne logique (is_legacy)
--
-- Fichiers détaillés (optionnel, même contenu séparé) :
--   supabase/RUN_WORKER_PROJECT_ASSIGNMENTS.sql
--   supabase/RUN_ATTENDANCE_LEGACY_ARCHIVE.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — Affectation N-N ouvriers / projets
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.worker_project_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'annulee')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wpa_worker_project_unique
  ON public.worker_project_assignments (worker_id, project_id);

CREATE INDEX IF NOT EXISTS idx_wpa_project
  ON public.worker_project_assignments (project_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_wpa_worker
  ON public.worker_project_assignments (worker_id)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS wpa_updated_at ON public.worker_project_assignments;
CREATE TRIGGER wpa_updated_at
  BEFORE UPDATE ON public.worker_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.worker_project_assignments (worker_id, project_id, status)
SELECT w.id, w.project_id, 'active'
FROM public.workers w
WHERE w.project_id IS NOT NULL
ON CONFLICT (worker_id, project_id) DO NOTHING;

ALTER TABLE public.worker_project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpa_auth ON public.worker_project_assignments;
CREATE POLICY wpa_auth ON public.worker_project_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — Archivage présences ancienne logique (sans suppression)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS source_version TEXT NOT NULL DEFAULT 'project_assignment';

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS legacy_archived_at TIMESTAMPTZ;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_source_version_check;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_source_version_check
  CHECK (source_version IN ('project_assignment', 'old_assignment'));

CREATE INDEX IF NOT EXISTS idx_attendance_active
  ON public.attendance (date DESC, worker_id)
  WHERE is_legacy = false;

CREATE INDEX IF NOT EXISTS idx_attendance_legacy
  ON public.attendance (legacy_archived_at DESC)
  WHERE is_legacy = true;

UPDATE public.attendance a
SET
  is_legacy = true,
  source_version = 'old_assignment',
  legacy_archived_at = COALESCE(a.legacy_archived_at, NOW())
WHERE COALESCE(a.is_legacy, false) = false
  AND (
    a.project_id IS NULL
    OR a.chef_chantier_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.worker_project_assignments wpa
      WHERE wpa.worker_id = a.worker_id
        AND wpa.project_id = a.project_id
        AND wpa.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.worker_project_assignments wpa
      WHERE wpa.worker_id = a.worker_id
        AND wpa.project_id = a.project_id
        AND wpa.status = 'active'
        AND a.date < (wpa.assigned_at AT TIME ZONE 'UTC')::date
    )
  );

UPDATE public.attendance a
SET
  is_legacy = false,
  source_version = 'project_assignment'
WHERE COALESCE(a.is_legacy, false) = false
  AND a.project_id IS NOT NULL
  AND a.chef_chantier_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.worker_project_assignments wpa
    WHERE wpa.worker_id = a.worker_id
      AND wpa.project_id = a.project_id
      AND wpa.status = 'active'
      AND a.date >= (wpa.assigned_at AT TIME ZONE 'UTC')::date
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'worker_project_assignments' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_project_assignments'
  ) THEN 'OK' ELSE 'MANQUANT' END AS status
UNION ALL
SELECT 'attendance.is_legacy',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'is_legacy'
  ) THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'affectations_actives',
  (SELECT COUNT(*)::text FROM public.worker_project_assignments WHERE status = 'active')
UNION ALL
SELECT 'presences_archivees_legacy',
  (SELECT COUNT(*)::text FROM public.attendance WHERE is_legacy = true)
UNION ALL
SELECT 'presences_actives',
  (SELECT COUNT(*)::text FROM public.attendance WHERE is_legacy = false);
