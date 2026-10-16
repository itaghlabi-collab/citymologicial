-- Planning projet : chefs de projet (rôle ERP chef_projet OU poste RH)
-- peuvent créer / modifier / supprimer tâches, jalons et ressources du planning,
-- sans obtenir « supprimer » sur toute la rubrique Projets.
-- Source de vérité : migrations/20261016110000_planning_chef_projet_poste.sql
-- (déjà appliqué en production le 2026-10-16)

CREATE OR REPLACE FUNCTION public.erp_is_chef_projet()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.erp_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND r.code = 'chef_projet'
      AND r.statut = 'actif'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.employees e ON lower(trim(e.email)) = lower(trim(p.email))
    WHERE p.id = auth.uid()
      AND nullif(trim(e.email), '') IS NOT NULL
      AND lower(coalesce(e.poste, '')) LIKE '%projet%'
      AND (
        lower(e.poste) LIKE '%chef%'
        OR lower(e.poste) LIKE '%cheffe%'
        OR lower(e.poste) LIKE '%responsable%'
        OR lower(e.poste) LIKE '%project manager%'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.erp_is_chef_projet() TO authenticated;

DROP POLICY IF EXISTS project_planning_tasks_insert ON public.project_planning_tasks;
CREATE POLICY project_planning_tasks_insert ON public.project_planning_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_tasks_update ON public.project_planning_tasks;
CREATE POLICY project_planning_tasks_update ON public.project_planning_tasks
  FOR UPDATE TO authenticated
  USING (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet())
  WITH CHECK (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_tasks_delete ON public.project_planning_tasks;
CREATE POLICY project_planning_tasks_delete ON public.project_planning_tasks
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_milestones_insert ON public.project_planning_milestones;
CREATE POLICY project_planning_milestones_insert ON public.project_planning_milestones
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_milestones_update ON public.project_planning_milestones;
CREATE POLICY project_planning_milestones_update ON public.project_planning_milestones
  FOR UPDATE TO authenticated
  USING (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet())
  WITH CHECK (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_milestones_delete ON public.project_planning_milestones;
CREATE POLICY project_planning_milestones_delete ON public.project_planning_milestones
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_resources_insert ON public.project_planning_resources;
CREATE POLICY project_planning_resources_insert ON public.project_planning_resources
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_resources_update ON public.project_planning_resources;
CREATE POLICY project_planning_resources_update ON public.project_planning_resources
  FOR UPDATE TO authenticated
  USING (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet())
  WITH CHECK (public.erp_can('modifier', 'projets') OR public.erp_is_chef_projet());

DROP POLICY IF EXISTS project_planning_resources_delete ON public.project_planning_resources;
CREATE POLICY project_planning_resources_delete ON public.project_planning_resources
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'projets') OR public.erp_is_chef_projet());

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('project_planning_tasks', 'project_planning_milestones', 'project_planning_resources')
ORDER BY tablename, cmd;
