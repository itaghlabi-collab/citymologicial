-- =============================================================================
-- FIX — Liste « Projet lié » vide pour chefs de chantier (Hamza / Oussama / Othmane)
-- Cause : RLS module « projets » bloque souvent la lecture pour le rôle chef.
-- Solution : RPC SECURITY DEFINER + policy SELECT liée (comme Achats).
-- À exécuter dans Supabase SQL Editor.
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

-- Liste pour formulaire ouvriers (inclut chef_chantier + responsable)
CREATE OR REPLACE FUNCTION public.list_projects_for_worker_link()
RETURNS TABLE (
  id uuid,
  ref text,
  nom text,
  statut text,
  responsable text,
  chef_chantier text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.ref,
    p.nom,
    p.statut,
    p.responsable,
    p.chef_chantier,
    p.created_at
  FROM public.projects p
  WHERE auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid())
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_worker_link() TO authenticated;

-- Permission voir projets pour rôles chefs (si absente)
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'projets', 'projets', 'voir', true
FROM public.erp_roles r
WHERE r.code IN ('chef_chantier', 'chef_projet', 'conducteur_travaux')
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

NOTIFY pgrst, 'reload schema';

-- Contrôle
SELECT COUNT(*)::int AS projets_en_base FROM public.projects;
SELECT proname FROM pg_proc WHERE proname = 'list_projects_for_worker_link';
