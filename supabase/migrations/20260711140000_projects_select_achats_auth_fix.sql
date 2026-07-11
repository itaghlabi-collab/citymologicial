-- Fix définitif : liste projets pour Achats (Laila WOTFI et tous utilisateurs connectés)
-- La RPC ne doit pas dépendre de erp_can (souvent false pour le rôle Achats).

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

COMMENT ON FUNCTION public.erp_can_read_projects_for_link() IS
  'Tout utilisateur ERP actif peut lire la liste projets pour les selects Achats/Finance.';

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
