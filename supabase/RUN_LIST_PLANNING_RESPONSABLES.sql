-- Liste des responsables planning — exécuter dans Supabase SQL Editor
-- Corrige la liste vide pour les chefs de projet (RLS employees sans permission RH).

CREATE OR REPLACE FUNCTION public.is_planning_responsable_poste(p_poste text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(trim(p_poste), '') = '' THEN false
    ELSE (
      lower(p_poste) LIKE '%project manager%'
      OR (lower(p_poste) LIKE '%chef%' AND lower(p_poste) LIKE '%projet%')
      OR (lower(p_poste) LIKE '%chef%' AND lower(p_poste) LIKE '%chantier%')
      OR (lower(p_poste) LIKE '%conducteur%' AND lower(p_poste) LIKE '%travaux%')
      OR (lower(p_poste) LIKE '%responsable%' AND lower(p_poste) LIKE '%chantier%')
      OR (lower(p_poste) LIKE '%responsable%' AND lower(p_poste) LIKE '%projet%')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.list_planning_responsables()
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
  FROM public.employees e
  WHERE lower(coalesce(e.statut, 'actif')) = 'actif'
    AND public.is_planning_responsable_poste(e.poste)
    AND (
      public.erp_can('voir', 'projets')
      OR public.erp_can('voir', 'employes')
      OR public.is_super_admin()
      OR public.is_erp_admin()
    )
  ORDER BY e.lastname, e.firstname;
$$;

GRANT EXECUTE ON FUNCTION public.list_planning_responsables() TO authenticated;

SELECT count(*)::int AS responsables_planning FROM public.list_planning_responsables();
