-- =============================================================================
-- CITYMO — Ciblage notifications + WhatsApp (structure future)
-- Supabase → SQL Editor → Run (après RUN_NOTIFICATIONS.sql)
-- Ré-exécutable
-- =============================================================================

-- Colonnes de ciblage
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role_id uuid REFERENCES public.erp_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_department_id integer REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submodule_code text,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS notifications_recipient_user_unread_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_submodule_idx
  ON public.notifications (submodule_code)
  WHERE submodule_code IS NOT NULL;

-- Types notification étendus (site_material_request)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
    'document', 'system', 'resource_request', 'site_material_request'
  )
);

-- Préférences WhatsApp utilisateur
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_sound_enabled boolean NOT NULL DEFAULT true;

-- Journal WhatsApp (envoi futur via API Business / Twilio / Meta)
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number text,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'queued', 'sent', 'failed', 'skipped')
  ),
  provider text,
  provider_ref text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS whatsapp_log_user_idx
  ON public.whatsapp_notification_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_log_status_idx
  ON public.whatsapp_notification_log (status, created_at DESC);

ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_log_select_own ON public.whatsapp_notification_log;
CREATE POLICY whatsapp_log_select_own ON public.whatsapp_notification_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS whatsapp_log_insert_auth ON public.whatsapp_notification_log;
CREATE POLICY whatsapp_log_insert_auth ON public.whatsapp_notification_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.whatsapp_notification_log TO authenticated, service_role;

-- RLS notifications : chaque utilisateur voit UNIQUEMENT ses notifications (+ globales explicites)
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR is_global = true
  );

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

SELECT 'notifications targeting OK' AS status;
