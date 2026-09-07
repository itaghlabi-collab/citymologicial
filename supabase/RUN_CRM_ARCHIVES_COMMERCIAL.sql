-- CITYMO — Titre (intitule) déjà présent ; ajouter commercial sur crm_archives
-- Supabase → SQL Editor → Run (idempotent)

ALTER TABLE public.crm_archives
  ADD COLUMN IF NOT EXISTS commercial TEXT;

COMMENT ON COLUMN public.crm_archives.commercial IS 'Commercial renseigné manuellement (archives importées)';
COMMENT ON COLUMN public.crm_archives.intitule IS 'Titre / intitulé du document (éditable pour archives importées)';

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'crm_archives'
  AND column_name IN ('intitule', 'commercial');
