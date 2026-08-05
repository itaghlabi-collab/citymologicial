-- =============================================================================
-- CITYMO — Autoriser statut succes_partiel sur erp_backups
-- Corrige : "new row for relation erp_backups violates check constraint"
-- (finalizeBackupRow:succes_partiel) sans toucher aux sauvegardes existantes.
-- Idempotent.
-- =============================================================================

ALTER TABLE public.erp_backups
  DROP CONSTRAINT IF EXISTS erp_backups_statut_check;

ALTER TABLE public.erp_backups
  ADD CONSTRAINT erp_backups_statut_check
  CHECK (statut IN ('succes', 'succes_partiel', 'en_cours', 'erreur', 'planifie'));

COMMENT ON CONSTRAINT erp_backups_statut_check ON public.erp_backups IS
  'Statuts backup : succes | succes_partiel | en_cours | erreur | planifie';

NOTIFY pgrst, 'reload schema';

-- À coller dans Supabase SQL Editor si la migration n’est pas appliquée automatiquement.
