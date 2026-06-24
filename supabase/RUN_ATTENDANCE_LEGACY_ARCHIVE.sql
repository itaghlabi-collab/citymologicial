-- =============================================================================
-- CITYMO ERP — Archivage présences ancienne logique (sans suppression)
-- Exécuter dans Supabase SQL Editor — idempotent (ADD ONLY)
--
-- Prérequis : RUN_WORKER_PROJECT_ASSIGNMENTS.sql (table worker_project_assignments)
--
-- Règle nouvelle logique :
--   présence valide = projet + ouvrier affecté (junction active) + chef chantier
-- =============================================================================

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

COMMENT ON COLUMN public.attendance.is_legacy IS
  'true = ancienne logique, exclue des présences et paiements hebdo actuels';
COMMENT ON COLUMN public.attendance.source_version IS
  'project_assignment (nouvelle logique) | old_assignment (archivée)';

-- ─── Archiver les présences qui ne respectent pas la nouvelle logique ───────
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
  );

-- Les nouvelles présences créées par l''app ont is_legacy = false par défaut
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
  );

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT COUNT(*)::int FROM public.attendance) AS total_presences,
  (SELECT COUNT(*)::int FROM public.attendance WHERE is_legacy = true) AS archivees_legacy,
  (SELECT COUNT(*)::int FROM public.attendance WHERE is_legacy = false) AS actives_nouvelle_logique;
