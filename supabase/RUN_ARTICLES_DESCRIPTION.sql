-- CRM Articles — colonne description (correction sauvegarde modifier article)
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS description TEXT;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'articles'
  AND column_name = 'description';
