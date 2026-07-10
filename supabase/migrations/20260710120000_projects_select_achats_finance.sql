-- Lecture des projets pour les listes déroulantes Achats / Finance
-- (ex. « Projet lié » dans Dépenses générales, demandes d'achat, ordres de paiement)
-- Sans ouvrir la gestion complète du module Projets.

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

NOTIFY pgrst, 'reload schema';
