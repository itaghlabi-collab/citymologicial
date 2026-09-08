-- =============================================================================
-- Pont Besoins matériaux (BM) → Demandes chantier (DC)
-- À exécuter dans Supabase SQL Editor.
-- =============================================================================

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

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('project_chantier_material_needs', 'site_material_requests')
  AND column_name IN ('site_request_id', 'site_request_ref', 'material_need_id')
ORDER BY table_name, column_name;
