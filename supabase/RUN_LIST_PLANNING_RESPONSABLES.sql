-- Corrige la liste Responsable vide pour les chefs de projet (ex. Hajar Zirari)
-- Exécuter dans Supabase SQL Editor.

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
      OR (lower(p_poste) LIKE '%cheffe%' AND lower(p_poste) LIKE '%projet%')
      OR (lower(p_poste) LIKE '%chef%' AND lower(p_poste) LIKE '%chantier%')
      OR (lower(p_poste) LIKE '%cheffe%' AND lower(p_poste) LIKE '%chantier%')
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
      public.erp_auth_ok()
      OR public.erp_legacy_access()
      OR public.is_super_admin()
      OR public.is_erp_admin()
    )
  ORDER BY e.lastname, e.firstname;
$$;

GRANT EXECUTE ON FUNCTION public.list_planning_responsables() TO authenticated;

DROP POLICY IF EXISTS employees_select_planning_responsables ON public.employees;
CREATE POLICY employees_select_planning_responsables ON public.employees
  FOR SELECT TO authenticated
  USING (
    public.erp_auth_ok()
    AND lower(coalesce(statut, 'actif')) = 'actif'
    AND public.is_planning_responsable_poste(poste)
  );

SELECT count(*)::int AS responsables_planning FROM public.list_planning_responsables();
