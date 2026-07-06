-- =============================================================================
-- CITYMO — Congés : gestion RH (tous employés, validation)
-- Supabase → SQL Editor → Run (après 20260525200000_leaves_rls_super_admin.sql)
-- Ré-exécutable
-- =============================================================================

-- Permission sous-rubrique (rôle + exceptions utilisateur)
CREATE OR REPLACE FUNCTION public.has_submodule_permission(
  p_user_id uuid,
  p_submodule text,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT upe.granted
      FROM public.user_permission_exceptions upe
      WHERE upe.user_id = p_user_id
        AND upe.submodule_code = p_submodule
        AND upe.action_code = p_action
      LIMIT 1
    ),
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role_id = p.role_id
      WHERE p.id = p_user_id
        AND rp.submodule_code = p_submodule
        AND rp.action_code = p_action
        AND rp.granted = true
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_submodule_permission(uuid, text, text) TO authenticated;

-- RH : accès employés + demandes de congé (ex. Hiba Barkaoui)
CREATE OR REPLACE FUNCTION public.is_leave_rh_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR (
      public.has_submodule_permission(auth.uid(), 'employes', 'voir')
      AND public.has_submodule_permission(auth.uid(), 'conges', 'voir')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_leave_rh_manager() TO authenticated;

-- ─── RLS leaves : étendre les droits admin au gestionnaire RH ───────────────
DROP POLICY IF EXISTS leaves_select_admin ON public.leaves;
CREATE POLICY leaves_select_admin ON public.leaves
  FOR SELECT TO authenticated
  USING (public.is_leave_rh_manager());

DROP POLICY IF EXISTS leaves_update_admin ON public.leaves;
CREATE POLICY leaves_update_admin ON public.leaves
  FOR UPDATE TO authenticated
  USING (public.is_leave_rh_manager())
  WITH CHECK (public.is_leave_rh_manager());

DROP POLICY IF EXISTS leaves_delete_admin ON public.leaves;
CREATE POLICY leaves_delete_admin ON public.leaves
  FOR DELETE TO authenticated
  USING (public.is_leave_rh_manager());
