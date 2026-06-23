-- CITYMO ERP — Google Drive (2e copie sauvegardes)
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS drive_synced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_sync_error TEXT;

COMMENT ON COLUMN public.erp_backups.drive_synced IS 'Copie Google Drive réussie';
COMMENT ON COLUMN public.erp_backups.drive_folder_id IS 'ID dossier Drive pour cette sauvegarde (BCK-YYYY-NNNN)';
