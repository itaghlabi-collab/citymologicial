-- CITYMO — Projets › Demande de transport
-- Chef de projet : évacuation (chantier → dépôt) ou transfert (chantier → chantier).
-- Magasinier : Traiter (chauffeur + véhicule) → En cours de transport → Traitée.
-- Additif uniquement : nouvelle table + droits sur le nouveau sous-module. Ré-exécutable.

CREATE TABLE IF NOT EXISTS public.project_transport_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                    TEXT UNIQUE,
  type                   TEXT NOT NULL DEFAULT 'evacuation'
                         CHECK (type IN ('evacuation', 'transfert')),
  depart                 TEXT NOT NULL,
  depart_project_id      UUID,
  destination            TEXT NOT NULL,
  destination_project_id UUID,
  materiel               TEXT NOT NULL,
  quantite               TEXT,
  date_souhaitee         DATE,
  priorite               TEXT NOT NULL DEFAULT 'normale'
                         CHECK (priorite IN ('normale', 'urgente')),
  remarque               TEXT,
  statut                 TEXT NOT NULL DEFAULT 'en_attente_traitement'
                         CHECK (statut IN ('en_attente_traitement', 'en_transport', 'traitee', 'annulee')),
  chauffeur              TEXT,
  vehicule               TEXT,
  date_transport         DATE,
  demandeur_nom          TEXT,
  traite_par             UUID,
  traite_par_nom         TEXT,
  created_by             UUID DEFAULT auth.uid(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_transport_requests_created_at_idx
  ON public.project_transport_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS project_transport_requests_statut_idx
  ON public.project_transport_requests (statut);

-- Réf. TR-YYYY-NNN + updated_at
CREATE OR REPLACE FUNCTION public.project_transport_requests_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_next INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ref IS NULL OR NEW.ref = '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('project_transport_requests_ref'));
      SELECT COALESCE(MAX(NULLIF(regexp_replace(ref, '^TR-' || v_year || '-', ''), ref)::INT), 0) + 1
        INTO v_next
        FROM public.project_transport_requests
        WHERE ref ~ ('^TR-' || v_year || '-[0-9]+$');
      NEW.ref := 'TR-' || v_year || '-' || lpad(v_next::TEXT, 3, '0');
    END IF;
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_transport_requests_before_write ON public.project_transport_requests;
CREATE TRIGGER project_transport_requests_before_write
  BEFORE INSERT OR UPDATE ON public.project_transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.project_transport_requests_before_write();

ALTER TABLE public.project_transport_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_transport_requests_select ON public.project_transport_requests;
CREATE POLICY project_transport_requests_select ON public.project_transport_requests
  FOR SELECT TO authenticated
  USING (public.erp_can('voir', 'demandes-transport'));

DROP POLICY IF EXISTS project_transport_requests_insert ON public.project_transport_requests;
CREATE POLICY project_transport_requests_insert ON public.project_transport_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'demandes-transport'));

DROP POLICY IF EXISTS project_transport_requests_update ON public.project_transport_requests;
CREATE POLICY project_transport_requests_update ON public.project_transport_requests
  FOR UPDATE TO authenticated
  USING (public.erp_can('voir', 'demandes-transport'))
  WITH CHECK (public.erp_can('voir', 'demandes-transport'));

DROP POLICY IF EXISTS project_transport_requests_delete ON public.project_transport_requests;
CREATE POLICY project_transport_requests_delete ON public.project_transport_requests
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'demandes-transport'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_transport_requests TO authenticated;
GRANT ALL ON public.project_transport_requests TO service_role;

-- Projets proposables (départ / destination), lecture seule.
CREATE OR REPLACE FUNCTION public.list_projects_for_transport()
RETURNS TABLE (id uuid, ref text, nom text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.ref, p.nom
  FROM public.projects p
  WHERE auth.uid() IS NOT NULL
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_projects_for_transport() TO authenticated;

-- Droits additifs sur le nouveau sous-module :
-- chefs de projet (mêmes rôles que « Location d'engins ») + magasiniers (mêmes rôles que « Demandes chantier »).
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT DISTINCT rp.role_id, 'projets', 'demandes-transport', rp.action_code, true
FROM public.role_permissions rp
WHERE rp.submodule_code IN ('demandes-engins', 'demandes-chantier')
  AND rp.granted = true
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT 'project_transport_requests OK' AS status;
