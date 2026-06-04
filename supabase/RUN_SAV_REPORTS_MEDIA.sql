ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS photos_avant JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS photos_apres JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS signature_path TEXT;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS signature_client_nom TEXT;

NOTIFY pgrst, 'reload schema';
