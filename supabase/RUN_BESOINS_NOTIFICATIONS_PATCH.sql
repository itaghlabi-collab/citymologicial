-- Patch : activer les notifications pour les demandes de ressources
-- À exécuter APRÈS RUN_NOTIFICATIONS.sql (si la table notifications existe)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION 'Table public.notifications absente — exécutez d''abord supabase/RUN_NOTIFICATIONS.sql';
  END IF;
END $$;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
      'document', 'system', 'resource_request'
    )
  );

SELECT 'resource_request notification type OK' AS status;
