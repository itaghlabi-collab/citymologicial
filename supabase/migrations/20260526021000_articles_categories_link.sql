-- Liaison articles ↔ categories
-- Ajoute FK si la colonne existe sans contrainte (idempotent)

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS categorie_id UUID;

CREATE INDEX IF NOT EXISTS idx_articles_categorie_id ON public.articles(categorie_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'articles_categorie_id_fkey'
      AND conrelid = 'public.articles'::regclass
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_categorie_id_fkey
      FOREIGN KEY (categorie_id)
      REFERENCES public.categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;
