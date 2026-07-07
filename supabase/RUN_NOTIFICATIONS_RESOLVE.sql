-- =============================================================================
-- CITYMO — Résolution destinataires notifications (bypass RLS profiles)
-- Supabase → SQL Editor → Run (après RUN_NOTIFICATIONS_TARGETING.sql)
-- Ré-exécutable
-- =============================================================================

-- Normalise un nom pour comparaison souple
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

-- Résout employé → user_id (priorité employee_id profil, puis email)
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
  -- 1. user_id direct
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_uid
    FROM public.profiles
    WHERE id = p_user_id
      AND coalesce(statut, 'actif') = 'actif'
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  -- 2. employee_id → profil lié
  IF p_employee_id IS NOT NULL THEN
    SELECT p.id INTO v_uid
    FROM public.profiles p
    WHERE p.employee_id = p_employee_id
      AND coalesce(p.statut, 'actif') = 'actif'
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

    SELECT e.email INTO v_emp_email
    FROM public.employees e
    WHERE e.id = p_employee_id
    LIMIT 1;

    IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
      SELECT id INTO v_uid
      FROM public.profiles
      WHERE lower(email) = lower(trim(v_emp_email))
        AND coalesce(statut, 'actif') = 'actif'
      LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;
  END IF;

  -- 3. email direct
  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT id INTO v_uid
    FROM public.profiles
    WHERE lower(email) = lower(trim(p_email))
      AND coalesce(statut, 'actif') = 'actif'
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  -- 4. nom affiché → employé RH → profil
  v_name := trim(coalesce(p_assignee_name, ''));
  IF v_name <> '' THEN
    IF position('@' in v_name) > 0 THEN
      SELECT id INTO v_uid
      FROM public.profiles
      WHERE lower(email) = lower(v_name)
        AND coalesce(statut, 'actif') = 'actif'
      LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;

    v_norm := public.normalize_person_name(v_name);

    SELECT e.id, e.email INTO v_emp_id, v_emp_email
    FROM public.employees e
    WHERE coalesce(e.statut, 'Actif') <> 'Inactif'
      AND (
        public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)) = v_norm
        OR public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname)) = v_norm
        OR public.normalize_person_name(e.lastname) = v_norm
        OR public.normalize_person_name(e.firstname) = v_norm
      )
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_emp_id IS NOT NULL THEN
      SELECT p.id INTO v_uid
      FROM public.profiles p
      WHERE p.employee_id = v_emp_id
        AND coalesce(p.statut, 'actif') = 'actif'
      LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

      IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
        SELECT id INTO v_uid
        FROM public.profiles
        WHERE lower(email) = lower(trim(v_emp_email))
          AND coalesce(statut, 'actif') = 'actif'
        LIMIT 1;
        IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
      END IF;
    END IF;

    -- 5. nom profil (dernier recours)
    SELECT id INTO v_uid
    FROM public.profiles
    WHERE public.normalize_person_name(nom) = v_norm
      AND coalesce(statut, 'actif') = 'actif'
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_notification_recipient(uuid, uuid, text, text) TO authenticated;

-- Cible utilisateurs par département / rôle / sous-rubrique (union)
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
      WHERE p.id = ANY(p_user_ids)
        AND coalesce(p.statut, 'actif') = 'actif'
    );
  END IF;

  IF p_role_id IS NOT NULL THEN
    v_ids := v_ids || array(
      SELECT p.id
      FROM public.profiles p
      WHERE p.role_id = p_role_id
        AND coalesce(p.statut, 'actif') = 'actif'
    );
  END IF;

  IF p_department_id IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT r.id), ARRAY[]::uuid[])
    INTO v_role_ids
    FROM public.erp_roles r
    WHERE r.department_id = p_department_id;

    v_ids := v_ids || array(
      SELECT p.id
      FROM public.profiles p
      WHERE coalesce(p.statut, 'actif') = 'actif'
        AND (
          p.department_id = p_department_id
          OR (v_role_ids IS NOT NULL AND p.role_id = ANY(v_role_ids))
        )
    );
  END IF;

  IF p_submodule_code IS NOT NULL AND trim(p_submodule_code) <> '' THEN
    v_ids := v_ids || array(
      SELECT DISTINCT p.id
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role_id = p.role_id
      WHERE rp.granted = true
        AND rp.action_code = 'voir'
        AND (rp.submodule_code = p_submodule_code OR rp.module_code = p_submodule_code)
        AND coalesce(p.statut, 'actif') = 'actif'
    );

    v_ids := v_ids || array(
      SELECT upe.user_id
      FROM public.user_permission_exceptions upe
      WHERE upe.submodule_code = p_submodule_code
        AND upe.action_code = 'voir'
        AND upe.granted = true
        AND upe.user_id IS NOT NULL
    );
  END IF;

  RETURN array(SELECT DISTINCT unnest(v_ids) WHERE unnest IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_notification_target_user_ids(integer, text, uuid, uuid[]) TO authenticated;

-- Lecture notifications : user direct + rôle/département + globales
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR is_global = true
    OR (
      recipient_role_id IS NOT NULL
      AND recipient_role_id = (
        SELECT p.role_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
    OR (
      recipient_department_id IS NOT NULL
      AND recipient_department_id = (
        SELECT p.department_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
    OR (
      recipient_role IS NOT NULL
      AND lower(trim(recipient_role)) = lower(trim(COALESCE(
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
        ''
      )))
    )
  );

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

SELECT 'notifications resolve RPC OK' AS status;
