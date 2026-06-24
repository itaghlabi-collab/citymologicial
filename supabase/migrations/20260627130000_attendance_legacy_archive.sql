-- Archivage présences ancienne logique (sans suppression)

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
      SELECT 1 FROM public.worker_project_assignments wpa
      WHERE wpa.worker_id = a.worker_id
        AND wpa.project_id = a.project_id
        AND wpa.status = 'active'
    )
  );

UPDATE public.attendance a
SET is_legacy = false, source_version = 'project_assignment'
WHERE COALESCE(a.is_legacy, false) = false
  AND a.project_id IS NOT NULL
  AND a.chef_chantier_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.worker_project_assignments wpa
    WHERE wpa.worker_id = a.worker_id
      AND wpa.project_id = a.project_id
      AND wpa.status = 'active'
  );
