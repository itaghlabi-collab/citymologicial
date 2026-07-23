-- Additive : regrouper plusieurs projets dans une même situation (group_id)
-- Idempotent — exécuter après RUN_SUBCONTRACTOR_ACCOUNT_V2.sql

ALTER TABLE public.subcontractor_situations
  ADD COLUMN IF NOT EXISTS group_id UUID;

CREATE INDEX IF NOT EXISTS idx_sub_sit_group
  ON public.subcontractor_situations (group_id)
  WHERE group_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

SELECT 'group_id' AS colonne,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractor_situations' AND column_name = 'group_id'
  ) THEN 'OK' ELSE 'MANQUANT' END AS status;
