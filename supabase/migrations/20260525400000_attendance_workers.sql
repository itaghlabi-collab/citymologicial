-- Présence ouvriers — alignement statuts UI + index worker_id
-- Exécuter après 20260525000000_rh_schema.sql et 20260525300000_workers_schema.sql

ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_statut_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_statut_check
  CHECK (statut IN ('present', 'absent', 'retard', 'demi_journee', 'conge'));

CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_chantier ON public.attendance(chantier);
CREATE INDEX IF NOT EXISTS idx_attendance_statut ON public.attendance(statut);
