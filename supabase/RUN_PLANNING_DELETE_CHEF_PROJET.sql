-- Planning projet : les chefs de projet (rôle chef_projet) peuvent supprimer les lignes
-- de project_planning_tasks, sans obtenir « supprimer » sur toute la rubrique Projets.

CREATE OR REPLACE FUNCTION public.erp_is_chef_projet()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.erp_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid() AND r.code = 'chef_projet' AND r.statut = 'actif'
  );
$$;
GRANT EXECUTE ON FUNCTION public.erp_is_chef_projet() TO authenticated;

DROP POLICY IF EXISTS project_planning_tasks_delete ON public.project_planning_tasks;
CREATE POLICY project_planning_tasks_delete ON public.project_planning_tasks
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'projets') OR public.erp_is_chef_projet());

-- Vérification
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'project_planning_tasks';
