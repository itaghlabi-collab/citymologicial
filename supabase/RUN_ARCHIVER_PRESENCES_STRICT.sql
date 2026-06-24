-- =============================================================================
-- CITYMO ERP — Archivage STRICT des présences ancienne logique
-- Exécuter dans Supabase SQL Editor — idempotent (ADD ONLY, pas de DELETE)
--
-- Prérequis : RUN_PRESENCE_NOUVELLE_LOGIQUE.sql (ou équivalent)
--
-- Règle : une présence active doit avoir
--   project_id + chef_chantier_id + junction active
--   + date >= date d'affectation junction
--   + source_version = 'project_assignment'
-- =============================================================================

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS source_version TEXT NOT NULL DEFAULT 'project_assignment';

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS legacy_archived_at TIMESTAMPTZ;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS validated_new_logic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_source_version_check;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_source_version_check
  CHECK (source_version IN ('project_assignment', 'old_assignment'));

-- 0) Cutover : archiver toutes les présences non validées par la nouvelle app
UPDATE public.attendance
SET
  is_legacy = true,
  source_version = 'old_assignment',
  validated_new_logic = false,
  legacy_archived_at = COALESCE(legacy_archived_at, NOW())
WHERE COALESCE(validated_new_logic, false) = false;

-- 1) Archiver : champs manquants ou pas d'affectation junction
UPDATE public.attendance a
SET
  is_legacy = true,
  source_version = 'old_assignment',
  validated_new_logic = false,
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

-- 2) Archiver : présence datée AVANT l'affectation junction (anciennes lignes)
UPDATE public.attendance a
SET
  is_legacy = true,
  source_version = 'old_assignment',
  validated_new_logic = false,
  legacy_archived_at = COALESCE(a.legacy_archived_at, NOW())
WHERE COALESCE(a.is_legacy, false) = false
  AND EXISTS (
    SELECT 1
    FROM public.worker_project_assignments wpa
    WHERE wpa.worker_id = a.worker_id
      AND wpa.project_id = a.project_id
      AND wpa.status = 'active'
      AND a.date < (wpa.assigned_at AT TIME ZONE 'UTC')::date
  );

-- validated_new_logic = true uniquement à l'insertion via l'application (pas de rétro-validation SQL)

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT COUNT(*)::int FROM public.attendance) AS total,
  (SELECT COUNT(*)::int FROM public.attendance WHERE is_legacy = true) AS archivees,
  (SELECT COUNT(*)::int FROM public.attendance WHERE validated_new_logic = true AND is_legacy = false) AS actives_validees,
  (SELECT COUNT(*)::int FROM public.attendance WHERE validated_new_logic = false) AS non_validees;
