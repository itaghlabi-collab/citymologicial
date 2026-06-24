-- =============================================================================
-- CITYMO ERP — Cutover présences : validated_new_logic
-- Exécuter dans Supabase SQL Editor — idempotent (ADD ONLY)
--
-- Effet : TOUTES les présences existantes sont archivées.
-- Seules les nouvelles présences créées via l'app (validated_new_logic=true) restent actives.
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

-- Archiver toutes les présences non validées (anciennes)
UPDATE public.attendance
SET
  is_legacy = true,
  source_version = 'old_assignment',
  validated_new_logic = false,
  legacy_archived_at = COALESCE(legacy_archived_at, NOW())
WHERE COALESCE(validated_new_logic, false) = false;

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT COUNT(*)::int FROM public.attendance) AS total,
  (SELECT COUNT(*)::int FROM public.attendance WHERE is_legacy = true) AS archivees,
  (SELECT COUNT(*)::int FROM public.attendance WHERE validated_new_logic = true AND is_legacy = false) AS actives_validees,
  (SELECT COUNT(*)::int FROM public.attendance WHERE validated_new_logic = false) AS non_validees;
