-- =============================================================================
-- CITYMO — FIX upsert_user_notification (ON CONFLICT 42P10)
-- Supabase → SQL Editor → Run immédiatement
-- =============================================================================

-- Index anti-doublon (requis pour upsert)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_user_idx
  ON public.notifications (recipient_user_id, entity_type, entity_id, type)
  WHERE recipient_user_id IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL;

-- Upsert robuste (sans ON CONFLICT — compatible tous index)
CREATE OR REPLACE FUNCTION public.upsert_user_notification(
  p_recipient_user_id uuid,
  p_title text,
  p_message text DEFAULT NULL,
  p_type text DEFAULT 'system',
  p_priority text DEFAULT 'normal',
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_submodule_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notifications;
  v_type text := coalesce(p_type, 'system');
BEGIN
  IF p_recipient_user_id IS NULL OR trim(coalesce(p_title, '')) = '' THEN
    RETURN NULL;
  END IF;

  IF p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN public.insert_user_notification(
      p_recipient_user_id, p_title, p_message, v_type, p_priority,
      p_entity_type, p_entity_id, p_action_url, p_created_by, p_submodule_code
    );
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      recipient_user_id, title, message, type, priority,
      entity_type, entity_id, action_url, created_by, submodule_code,
      is_read, read_at
    ) VALUES (
      p_recipient_user_id,
      trim(p_title),
      NULLIF(trim(coalesce(p_message, '')), ''),
      v_type,
      coalesce(p_priority, 'normal'),
      p_entity_type,
      p_entity_id,
      p_action_url,
      p_created_by,
      p_submodule_code,
      false,
      NULL
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.notifications
    SET
      title = trim(p_title),
      message = NULLIF(trim(coalesce(p_message, '')), ''),
      priority = coalesce(p_priority, 'normal'),
      action_url = p_action_url,
      submodule_code = p_submodule_code,
      is_read = false,
      read_at = NULL,
      created_at = now()
    WHERE recipient_user_id = p_recipient_user_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND type = v_type
    RETURNING * INTO v_row;
  END;

  RETURN CASE WHEN v_row IS NULL THEN NULL ELSE to_jsonb(v_row) END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_notification(
  uuid, text, text, text, text, text, uuid, text, uuid, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Test Hiba (doit retourner un JSON, pas d'erreur)
SELECT public.upsert_user_notification(
  '74f27da8-fc77-4e7e-b1a4-86b0da2ee55d'::uuid,
  'Test Hiba',
  'Notification de test — système réparé.',
  'task', 'high', 'test_manual', gen_random_uuid(),
  'module:taches', NULL, 'taches'
) AS test_ok;
