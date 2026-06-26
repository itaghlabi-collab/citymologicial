-- Workflow RH v2 — statuts partielle / refusee + besoin refuse
-- Exécuter dans Supabase SQL Editor

ALTER TABLE public.resource_requests DROP CONSTRAINT IF EXISTS resource_requests_statut_check;
ALTER TABLE public.resource_requests ADD CONSTRAINT resource_requests_statut_check CHECK (
  statut IN ('en_attente', 'en_cours', 'partielle', 'affectee', 'refusee', 'cloturee')
);

ALTER TABLE public.project_staff_needs DROP CONSTRAINT IF EXISTS project_staff_needs_statut_check;
ALTER TABLE public.project_staff_needs ADD CONSTRAINT project_staff_needs_statut_check CHECK (
  statut IN ('brouillon', 'soumis', 'en_recherche_rh', 'partiellement_couvert', 'couvert', 'refuse', 'annule', 'clos')
);
