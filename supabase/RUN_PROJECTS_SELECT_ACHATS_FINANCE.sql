-- =============================================================================
-- FIX — Liste « Projet lié » vide pour Laila WOTFI (Responsable Achats)
-- Exécuter dans Supabase SQL Editor (obligatoire si le dropdown reste vide).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.erp_can_read_projects_for_link()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.erp_can_read_projects_for_link() TO authenticated;

DROP POLICY IF EXISTS projects_select_linked ON public.projects;
CREATE POLICY projects_select_linked ON public.projects
  FOR SELECT TO authenticated
  USING (public.erp_can_read_projects_for_link());

CREATE OR REPLACE FUNCTION public.list_projects_for_purchase_select()
RETURNS TABLE (
  id uuid,
  ref text,
  nom text,
  client_nom text,
  statut text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.ref, p.nom, p.client_nom, p.statut, p.created_at
  FROM public.projects p
  WHERE auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid())
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_purchase_select() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_projects_for_charges_select()
RETURNS TABLE (
  id uuid,
  ref text,
  nom text,
  client_nom text,
  statut text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.ref, p.nom, p.client_nom, p.statut, p.created_at
  FROM public.projects p
  WHERE auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid())
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_charges_select() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Permission lecture projets pour le rôle Achats (liste déroulante « Projet lié »)
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'projets', 'projets', 'voir', true
FROM public.erp_roles r
WHERE r.code = 'achats'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Contrôle (en tant qu'utilisateur connecté via SQL editor = service role voit tout)
SELECT COUNT(*)::int AS projets_en_base FROM public.projects;
