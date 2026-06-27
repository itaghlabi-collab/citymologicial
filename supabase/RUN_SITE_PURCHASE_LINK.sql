-- CITYMO — Lien optionnel demande chantier ↔ demande d'achat
-- Le lien fonctionne déjà via purchase_requests.payload (JSONB).
-- Ce script ajoute une colonne explicite pour faciliter les requêtes SQL.

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS site_material_request_id UUID
    REFERENCES public.site_material_requests(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS site_material_request_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_site_material_request
  ON public.purchase_requests(site_material_request_id)
  WHERE site_material_request_id IS NOT NULL;
