-- =============================================================================
-- CITYMO — Liste « Projet lié » pour Responsable Achats (Laila WOTFI) / Finance
-- Exécuter dans Supabase → SQL Editor si le dropdown projets est vide.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.erp_can_read_projects_for_link()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.erp_auth_ok()
    AND (
      public.is_super_admin()
      OR public.is_erp_admin()
      OR public.erp_legacy_access()
      OR public.erp_can('voir', 'projets')
      OR public.erp_can('voir', 'demandes-achat')
      OR public.erp_can('voir', 'bons-commande')
      OR public.erp_can('voir', 'ordres-achat')
      OR public.erp_can('voir', 'fournisseurs')
      OR public.erp_can('voir', 'charges')
      OR public.erp_can('voir', 'ordres-paiement')
      OR public.erp_can('voir', 'depenses-par-projet')
      OR public.has_submodule_permission(auth.uid(), 'demandes-achat', 'voir')
      OR public.has_submodule_permission(auth.uid(), 'demandes-achat', 'creer')
      OR public.has_submodule_permission(auth.uid(), 'bons-commande', 'voir')
      OR public.has_submodule_permission(auth.uid(), 'ordres-achat', 'voir')
      OR public.has_submodule_permission(auth.uid(), 'fournisseurs', 'voir')
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.erp_roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND lower(r.code) IN ('achats', 'finance', 'dg', 'super_admin')
          AND lower(coalesce(r.statut, 'actif')) = 'actif'
      )
    );
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
  WHERE public.erp_can_read_projects_for_link()
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
  WHERE public.erp_can_read_projects_for_link()
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_charges_select() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT COUNT(*)::int AS projets_visibles_achats FROM public.list_projects_for_purchase_select();
