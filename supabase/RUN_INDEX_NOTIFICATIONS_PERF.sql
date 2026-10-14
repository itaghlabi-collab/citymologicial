-- CITYMO — Performance cloche de notifications
-- La cloche cherche « recipient_user_id = moi OU is_global = true ».
-- Ajoute l'index manquant sur les notifications globales (et s'assure que celui par destinataire existe).
-- Index uniquement : aucune donnée lue, modifiée ou supprimée. Ré-exécutable.

CREATE INDEX IF NOT EXISTS notifications_recipient_user_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_global'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS notifications_global_created_idx
             ON public.notifications (created_at DESC) WHERE is_global = true';
  END IF;
END $$;

ANALYZE public.notifications;

SELECT 'index notifications OK' AS status;
