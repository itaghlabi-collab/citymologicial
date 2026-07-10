-- =============================================================================
-- CITYMO — Afficher la liste « Projet lié » pour Responsable Achats / Finance
-- Exécuter dans Supabase → SQL Editor si les projets n'apparaissent pas dans
-- Dépenses générales ou Demandes d'achat (ex. session Laila WOTFI).
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
      OR public.erp_can('voir', 'charges')
      OR public.erp_can('voir', 'ordres-paiement')
      OR public.erp_can('voir', 'depenses-par-projet')
    );
$$;

GRANT EXECUTE ON FUNCTION public.erp_can_read_projects_for_link() TO authenticated;

COMMENT ON FUNCTION public.erp_can_read_projects_for_link() IS
  'Lecture liste projets (id, ref, nom) pour modules Achats / Finance sans accès module Projets.';

DROP POLICY IF EXISTS projects_select_linked ON public.projects;
CREATE POLICY projects_select_linked ON public.projects
  FOR SELECT TO authenticated
  USING (public.erp_can_read_projects_for_link());

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
  WHERE public.erp_auth_ok()
    AND (
      public.is_super_admin()
      OR public.is_erp_admin()
      OR public.erp_legacy_access()
      OR public.has_submodule_permission(auth.uid(), 'charges', 'voir')
      OR public.has_submodule_permission(auth.uid(), 'charges', 'creer')
      OR public.has_submodule_permission(auth.uid(), 'charges', 'modifier')
      OR public.has_submodule_permission(auth.uid(), 'projets', 'voir')
    )
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_charges_select() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Contrôle (service_role) : nombre de projets en base
SELECT COUNT(*) AS projets_en_base FROM public.projects;
