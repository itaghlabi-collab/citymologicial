-- =============================================================================
-- CITYMO ERP — ÉTAPE 5 : Google Drive (optionnel — 2e copie sauvegardes)
-- Supabase SQL Editor → Coller tout → Run
-- Prérequis : ÉTAPE 4 exécutée
-- =============================================================================

ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS drive_synced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_sync_error TEXT;

COMMENT ON COLUMN public.erp_backups.drive_synced IS 'Copie Google Drive réussie';
COMMENT ON COLUMN public.erp_backups.drive_folder_id IS 'ID dossier Drive pour cette sauvegarde (BCK-YYYY-NNNN)';
COMMENT ON COLUMN public.erp_backups.drive_sync_error IS 'Dernière erreur sync Drive';
