-- Présence : lecture chefs de chantier pour formulaire (session chef)
CREATE OR REPLACE FUNCTION public.list_chefs_chantier_for_presence()
RETURNS TABLE (
  id uuid,
  firstname text,
  lastname text,
  poste text,
  statut text,
  telephone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.firstname,
    e.lastname,
    e.poste,
    e.statut,
    e.telephone
  FROM public.employees e
  WHERE auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid())
    AND (
      e.poste ILIKE '%chef%chantier%'
      OR e.poste ILIKE '%conducteur%travaux%'
      OR e.poste ILIKE '%responsable%chantier%'
    )
  ORDER BY e.lastname ASC NULLS LAST, e.firstname ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_chefs_chantier_for_presence() TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_can_read_employees_for_presence()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.erp_can_read_employees_for_presence() TO authenticated;

DROP POLICY IF EXISTS employees_select_presence ON public.employees;
CREATE POLICY employees_select_presence ON public.employees
  FOR SELECT TO authenticated
  USING (public.erp_can_read_employees_for_presence());
