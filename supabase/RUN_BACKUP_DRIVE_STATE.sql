-- =============================================================================
-- CITYMO — État Google Drive + colonnes planification anti-doublon
-- SQL Editor → Run (idempotent). Ne touche pas aux sauvegardes réussies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.erp_backup_drive_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'unknown',
  -- active | reconnect_required | disconnected | misconfigured | unknown
  last_error_code text,
  last_error_user_message text,
  last_check_at timestamptz,
  last_success_at timestamptz,
  connected_account text,
  folder_id text,
  -- refresh_token OAuth rotatif (jamais exposé via API client)
  oauth_refresh_token text,
  notify_reconnect_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.erp_backup_drive_state (id, status)
VALUES (1, 'unknown')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.erp_backup_schedules
  ADD COLUMN IF NOT EXISTS last_period_key text,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_user_message text;

ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS user_message text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS schedule_period_key text,
  ADD COLUMN IF NOT EXISTS steps_json jsonb;

COMMENT ON COLUMN public.erp_backups.user_message IS 'Message lisible UI (sans secrets)';
COMMENT ON COLUMN public.erp_backups.error_code IS 'Code technique court (ex: invalid_grant, storage_upload)';
COMMENT ON COLUMN public.erp_backups.schedule_period_key IS 'Clé anti-doublon planification (ex: quotidienne:2026-07-24)';

ALTER TABLE public.erp_backup_drive_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_backup_drive_state_super ON public.erp_backup_drive_state;
CREATE POLICY erp_backup_drive_state_super ON public.erp_backup_drive_state
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
