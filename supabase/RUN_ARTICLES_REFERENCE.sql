-- Références courtes articles CRM (E001, CL001, …)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_reference_unique
  ON public.articles (reference)
  WHERE reference IS NOT NULL AND reference <> '';

NOTIFY pgrst, 'reload schema';
