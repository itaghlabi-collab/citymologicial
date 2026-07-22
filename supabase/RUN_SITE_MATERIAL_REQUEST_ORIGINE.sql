-- CITYMO — Origine demandes chantier (catalogue | manuelle)
-- Exécuter dans Supabase SQL Editor si besoin.
-- Additive only — n'altère pas les données / workflows existants.

ALTER TABLE public.site_material_requests
  ADD COLUMN IF NOT EXISTS origine TEXT NOT NULL DEFAULT 'catalogue';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_material_requests_origine_check'
  ) THEN
    ALTER TABLE public.site_material_requests
      ADD CONSTRAINT site_material_requests_origine_check
      CHECK (origine IN ('catalogue', 'manuelle'));
  END IF;
END $$;

ALTER TABLE public.site_material_request_lines
  ADD COLUMN IF NOT EXISTS date_souhaitee DATE;

COMMENT ON COLUMN public.site_material_requests.origine IS
  'catalogue = depuis catalogue stock ; manuelle = hors catalogue';

SELECT 'site_material_requests origine OK' AS status;
