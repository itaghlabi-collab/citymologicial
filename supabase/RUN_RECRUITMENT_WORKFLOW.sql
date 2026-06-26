-- Recrutement lié aux demandes ressources + statuts étendus
-- Exécuter dans Supabase SQL Editor

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS parent_request_id UUID;
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'ressource';
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS recruitment_statut TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_parent_request_id_fkey') THEN
    ALTER TABLE public.resource_requests
      ADD CONSTRAINT resource_requests_parent_request_id_fkey
      FOREIGN KEY (parent_request_id) REFERENCES public.resource_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_resource_requests_parent ON public.resource_requests(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_type ON public.resource_requests(request_type);

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_statut_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_statut_check CHECK (
  statut IN ('en_attente', 'en_cours', 'partielle', 'affectee', 'recrutement_en_cours', 'refusee', 'cloturee')
);

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_request_type_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_request_type_check CHECK (
  request_type IN ('ressource', 'recrutement')
);

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_recruitment_statut_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_recruitment_statut_check CHECK (
  recruitment_statut IS NULL OR recruitment_statut IN ('cree', 'en_recherche', 'entretien', 'valide', 'annule', 'cloture')
);
