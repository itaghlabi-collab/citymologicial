-- =============================================================================
-- CITYMO ERP — Schéma complet erp_backups (prod Supabase SQL Editor)
-- Idempotent : ADD COLUMN IF NOT EXISTS uniquement
-- =============================================================================

-- Opérationnel (file_path, erreurs, provider)
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  ADD COLUMN IF NOT EXISTS schedule_type TEXT;

-- Google Drive (2e copie)
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS drive_synced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_sync_error TEXT;

-- Heartbeat progression jobs longs
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ;

COMMENT ON COLUMN public.erp_backups.drive_synced IS 'Copie Google Drive réussie';
COMMENT ON COLUMN public.erp_backups.drive_folder_id IS 'ID dossier Drive pour cette sauvegarde (BCK-YYYY-NNNN)';
COMMENT ON COLUMN public.erp_backups.drive_sync_error IS 'Dernière erreur sync Drive';
COMMENT ON COLUMN public.erp_backups.progress_at IS 'Dernière activité du job (export DB, copie fichiers, etc.)';
