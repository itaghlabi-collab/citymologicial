-- CITYMO — Demande de récupération
-- 1) Nouveau statut « en_transport » (En cours de transport), aucune donnée existante modifiée.
-- 2) Lecture seule de la DA liée à une demande de récupération (popup magasinier),
--    sans donner accès à toute la rubrique Demandes d'achat.

ALTER TABLE public.achat_demandes_recuperation
  DROP CONSTRAINT IF EXISTS achat_demandes_recuperation_statut_check;
ALTER TABLE public.achat_demandes_recuperation
  ADD CONSTRAINT achat_demandes_recuperation_statut_check
  CHECK (statut IN ('en_cours', 'prete_a_recuperer', 'en_transport', 'recuperee', 'annulee'));

CREATE OR REPLACE FUNCTION public.get_recup_purchase_request(p_recup_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ref_demande', pr.ref_demande,
    'titre', pr.titre,
    'priorite', pr.priorite,
    'date_limite', pr.date_limite,
    'project_ref', pr.project_ref,
    'project_name', pr.project_name,
    'requester_name', pr.requester_name,
    'description', pr.description,
    'created_at', pr.created_at,
    'fournisseur_souhaite', pr.payload->>'fournisseur_souhaite',
    'lines', COALESCE(pr.payload->'lines', '[]'::jsonb)
  )
  FROM public.achat_demandes_recuperation d
  JOIN public.purchase_requests pr ON pr.id = d.purchase_request_id
  WHERE d.id = p_recup_id
    AND auth.uid() IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_recup_purchase_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
