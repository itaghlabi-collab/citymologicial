-- Heartbeat progression sauvegardes (évite faux « erreur » sur jobs longs encore actifs)
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ;

COMMENT ON COLUMN public.erp_backups.progress_at IS
  'Dernière activité du job (export DB, copie fichiers, etc.)';
