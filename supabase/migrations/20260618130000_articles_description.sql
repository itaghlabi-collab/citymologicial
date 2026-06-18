-- Description article CRM (texte libre, multi-lignes)

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS description TEXT;
