-- =============================================================================
-- CITYMO — Centre de notifications ERP
-- Supabase → SQL Editor → Run
-- Ré-exécutable — pas de DROP / TRUNCATE / DELETE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_role text,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'system',
  priority text NOT NULL DEFAULT 'normal',
  entity_type text,
  entity_id uuid,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT notifications_type_check CHECK (
    type IN ('payment', 'task', 'cash_review', 'leave_request', 'purchase_request', 'document', 'system', 'resource_request')
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_user_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx
  ON public.notifications (recipient_role, is_read, created_at DESC)
  WHERE recipient_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

-- Doublons existants : garder la notification la plus récente avant index unique
DELETE FROM public.notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY recipient_user_id, entity_type, entity_id, type
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.notifications
    WHERE recipient_user_id IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

DELETE FROM public.notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY recipient_role, entity_type, entity_id, type
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.notifications
    WHERE recipient_user_id IS NULL
      AND recipient_role IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

-- Anti-doublon : une notification par destinataire + entité + type
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_user_idx
  ON public.notifications (recipient_user_id, entity_type, entity_id, type)
  WHERE recipient_user_id IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_role_idx
  ON public.notifications (recipient_role, entity_type, entity_id, type)
  WHERE recipient_user_id IS NULL
    AND recipient_role IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR (
      recipient_role IS NOT NULL
      AND lower(trim(recipient_role)) = lower(trim(COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()),
        ''
      )))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  );

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  )
  WITH CHECK (true);

GRANT ALL ON public.notifications TO authenticated, service_role;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

SELECT 'notifications OK' AS status;
