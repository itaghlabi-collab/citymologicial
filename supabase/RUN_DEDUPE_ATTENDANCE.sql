-- Deduplicate attendance: keep ONE row per (worker_id, project_id, date).
-- Prefers the row with the longest worked interval, then oldest created_at.
-- SAFE: only deletes extras when duplicates exist. Does not touch unique days.
-- Run in Supabase SQL Editor once, then verify Présence.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    worker_id,
    project_id,
    date,
    heure_entree,
    heure_sortie,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY worker_id, project_id, date
      ORDER BY
        /* Prefer complete day (sortie after entree with more minutes) */
        COALESCE(
          EXTRACT(EPOCH FROM (heure_sortie - heure_entree)),
          0
        ) DESC NULLS LAST,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.attendance
  WHERE worker_id IS NOT NULL
    AND project_id IS NOT NULL
    AND date IS NOT NULL
    AND COALESCE(is_legacy, false) = false
)
DELETE FROM public.attendance a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

COMMIT;

-- Optional: prevent future duplicates at DB level (run AFTER cleanup)
-- CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_project_date_uidx
--   ON public.attendance (worker_id, project_id, date)
--   WHERE COALESCE(is_legacy, false) = false
--     AND worker_id IS NOT NULL
--     AND project_id IS NOT NULL;
