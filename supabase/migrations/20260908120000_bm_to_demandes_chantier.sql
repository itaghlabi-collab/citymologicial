-- Lien BM (besoins matériaux) ↔ DC (demandes chantier)
ALTER TABLE public.project_chantier_material_needs
  ADD COLUMN IF NOT EXISTS site_request_id UUID REFERENCES public.site_material_requests(id) ON DELETE SET NULL;

ALTER TABLE public.project_chantier_material_needs
  ADD COLUMN IF NOT EXISTS site_request_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_pcmn_site_request
  ON public.project_chantier_material_needs (site_request_id);

ALTER TABLE public.site_material_requests
  ADD COLUMN IF NOT EXISTS material_need_id UUID REFERENCES public.project_chantier_material_needs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_smr_material_need
  ON public.site_material_requests (material_need_id);
