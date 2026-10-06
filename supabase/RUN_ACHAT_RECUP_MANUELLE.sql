-- CITYMO — Demande de récupération 100 % manuelle
-- Additif uniquement : nouveaux statuts + colonnes, aucune donnée existante modifiée.
-- Ré-exécutable sans risque.

ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS depart TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS destination_project_id UUID;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS remarque TEXT;

ALTER TABLE public.achat_demandes_recuperation
  DROP CONSTRAINT IF EXISTS achat_demandes_recuperation_statut_check;
ALTER TABLE public.achat_demandes_recuperation
  ADD CONSTRAINT achat_demandes_recuperation_statut_check
  CHECK (statut IN (
    'en_cours', 'prete_a_recuperer', 'en_transport', 'recuperee', 'annulee',
    'en_attente_traitement', 'traitee'
  ));

-- Demandes d'achat proposables (lecture seule, sans ouvrir la rubrique Demandes d'achat).
CREATE OR REPLACE FUNCTION public.list_purchase_requests_for_recup()
RETURNS TABLE (
  id uuid,
  ref_demande text,
  titre text,
  statut text,
  project_id uuid,
  project_ref text,
  project_name text,
  fournisseur_souhaite text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.ref_demande, pr.titre, pr.statut, pr.project_id, pr.project_ref, pr.project_name,
         pr.payload->>'fournisseur_souhaite', pr.created_at
  FROM public.purchase_requests pr
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(pr.statut, '') NOT IN ('Brouillon', 'Refusée', 'Annulée')
  ORDER BY pr.created_at DESC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.list_purchase_requests_for_recup() TO authenticated;

-- Projets proposables comme destination (lecture seule).
CREATE OR REPLACE FUNCTION public.list_projects_for_recup()
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

GRANT EXECUTE ON FUNCTION public.list_projects_for_recup() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'achat_recup_manuelle OK' AS status;
