-- =============================================================================
-- CITYMO — FIX URGENT notifications (ciblage, lecture, destinataires)
-- Supabase → SQL Editor → Run (ré-exécutable, autonome)
-- =============================================================================

-- Normalise un nom pour comparaison souple (requis par resolve_notification_recipient)
CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(
    translate(coalesce(p_name, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'),
    '\s+', ' ', 'g'
  )));
$$;

-- Statut actif : insensible à la casse
CREATE OR REPLACE FUNCTION public.profile_is_active(p_statut text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(trim(p_statut), 'actif')) = 'actif';
$$;

-- Résolution destinataire (version corrigée)
CREATE OR REPLACE FUNCTION public.resolve_notification_recipient(
  p_user_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_assignee_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_emp_id uuid;
  v_emp_email text;
  v_name text;
  v_norm text;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE id = p_user_id AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT p.id INTO v_uid FROM public.profiles p
    WHERE p.employee_id = p_employee_id AND public.profile_is_active(p.statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

    SELECT e.email INTO v_emp_email FROM public.employees e WHERE e.id = p_employee_id LIMIT 1;
    IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(trim(v_emp_email)) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;
  END IF;

  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE lower(email) = lower(trim(p_email)) AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  v_name := trim(coalesce(p_assignee_name, ''));
  IF v_name <> '' THEN
    IF position('@' in v_name) > 0 THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(v_name) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;

    v_norm := public.normalize_person_name(v_name);
    SELECT e.id, e.email INTO v_emp_id, v_emp_email
    FROM public.employees e
    WHERE lower(coalesce(e.statut, 'actif')) <> 'inactif'
      AND (
        public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)) = v_norm
        OR public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname)) = v_norm
        OR public.normalize_person_name(e.lastname) = v_norm
        OR public.normalize_person_name(e.firstname) = v_norm
      )
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_emp_id IS NOT NULL THEN
      SELECT p.id INTO v_uid FROM public.profiles p
      WHERE p.employee_id = v_emp_id AND public.profile_is_active(p.statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

      IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
        SELECT id INTO v_uid FROM public.profiles
        WHERE lower(email) = lower(trim(v_emp_email)) AND public.profile_is_active(statut) LIMIT 1;
        IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
      END IF;
    END IF;

    SELECT id INTO v_uid FROM public.profiles
    WHERE public.normalize_person_name(nom) = v_norm AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Cible utilisateurs (statut corrigé)
CREATE OR REPLACE FUNCTION public.list_notification_target_user_ids(
  p_department_id integer DEFAULT NULL,
  p_submodule_code text DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_role_ids uuid[];
BEGIN
  IF p_user_ids IS NOT NULL THEN
    v_ids := v_ids || array(
      SELECT DISTINCT unnest(p_user_ids)
      FROM public.profiles p
      WHERE p.id = ANY(p_user_ids) AND public.profile_is_active(p.statut)
    );
  END IF;

  IF p_role_id IS NOT NULL THEN
    v_ids := v_ids || array(
      SELECT p.id FROM public.profiles p
      WHERE p.role_id = p_role_id AND public.profile_is_active(p.statut)
    );
  END IF;

  IF p_department_id IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT r.id), ARRAY[]::uuid[]) INTO v_role_ids
    FROM public.erp_roles r WHERE r.department_id = p_department_id;

    v_ids := v_ids || array(
      SELECT p.id FROM public.profiles p
      WHERE public.profile_is_active(p.statut)
        AND (p.department_id = p_department_id OR (v_role_ids IS NOT NULL AND p.role_id = ANY(v_role_ids)))
    );
  END IF;

  IF p_submodule_code IS NOT NULL AND trim(p_submodule_code) <> '' THEN
    v_ids := v_ids || array(
      SELECT DISTINCT p.id
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role_id = p.role_id
      WHERE rp.granted = true AND rp.action_code = 'voir'
        AND (rp.submodule_code = p_submodule_code OR rp.module_code = p_submodule_code)
        AND public.profile_is_active(p.statut)
    );
    v_ids := v_ids || array(
      SELECT upe.user_id FROM public.user_permission_exceptions upe
      WHERE upe.submodule_code = p_submodule_code AND upe.action_code = 'voir'
        AND upe.granted = true AND upe.user_id IS NOT NULL
    );
  END IF;

  RETURN array(SELECT DISTINCT unnest(v_ids) WHERE unnest IS NOT NULL);
END;
$$;

-- DG / Super Admin (bypass RLS profiles)
CREATE OR REPLACE FUNCTION public.list_super_admin_dg_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT p.id), ARRAY[]::uuid[])
  FROM public.profiles p
  WHERE public.profile_is_active(p.statut)
    AND (
      lower(coalesce(p.email, '')) IN (
        'selim.moumni@gmail.com',
        'selim@citymo.ma',
        'admin@citymo.ma'
      )
      OR lower(coalesce(p.role, '')) IN ('super_admin', 'super admin', 'dg', 'directeur_general', 'directeur general')
      OR lower(coalesce(p.role, '')) LIKE '%directeur%general%'
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_super_admin_dg_user_ids() TO authenticated;

-- Upsert notification utilisateur (contourne RLS pour refresh anti-doublon)
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
BEGIN
  IF p_recipient_user_id IS NULL OR trim(coalesce(p_title, '')) = '' THEN
    RETURN NULL;
  END IF;
  IF p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id, title, message, type, priority,
    entity_type, entity_id, action_url, created_by, submodule_code,
    is_read, read_at
  ) VALUES (
    p_recipient_user_id,
    trim(p_title),
    NULLIF(trim(coalesce(p_message, '')), ''),
    coalesce(p_type, 'system'),
    coalesce(p_priority, 'normal'),
    p_entity_type,
    p_entity_id,
    p_action_url,
    p_created_by,
    p_submodule_code,
    false,
    NULL
  )
  ON CONFLICT (recipient_user_id, entity_type, entity_id, type)
  WHERE recipient_user_id IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    priority = EXCLUDED.priority,
    action_url = EXCLUDED.action_url,
    submodule_code = EXCLUDED.submodule_code,
    is_read = false,
    read_at = NULL,
    created_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_notification(
  uuid, text, text, text, text, text, uuid, text, uuid, text
) TO authenticated;

-- Nettoyage : une notif personnalisée = recipient_user_id seul (évite fuites OR département)
UPDATE public.notifications
SET
  recipient_role = NULL,
  recipient_role_id = NULL,
  recipient_department_id = NULL
WHERE recipient_user_id IS NOT NULL
  AND (recipient_role IS NOT NULL OR recipient_role_id IS NOT NULL OR recipient_department_id IS NOT NULL);

-- Lecture : uniquement MES notifications (+ globales explicites)
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
  USING (
    recipient_user_id = auth.uid()
    OR is_global = true
  )
  WITH CHECK (
    recipient_user_id = auth.uid()
    OR is_global = true
  );

NOTIFY pgrst, 'reload schema';

SELECT 'notifications FIX OK' AS status;
