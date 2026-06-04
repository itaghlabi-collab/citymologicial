-- Devis en attente — module Commercial / Marketing
-- Coller ce fichier en entier dans Supabase SQL Editor
-- Prérequis : table public.prospects (20260525700000_prospects.sql)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.devis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT UNIQUE,
  prospect_id     UUID,
  type_projet     TEXT NOT NULL,
  source          TEXT NOT NULL,
  montant_estime  NUMERIC(12, 2),
  statut          TEXT NOT NULL DEFAULT 'en_attente',
  commentaire     TEXT,
  date_relance    DATE,
  assigne_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS prospect_id UUID;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS montant_estime NUMERIC(12, 2);
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS assigne_id UUID;

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis
  ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'realise', 'refuse'));

-- FK prospect_id → prospects (si table prospects existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'devis_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.devis
        ADD CONSTRAINT devis_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS devis_updated_at ON public.devis;
CREATE TRIGGER devis_updated_at
  BEFORE UPDATE ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_devis_prospect_id ON public.devis(prospect_id);
CREATE INDEX IF NOT EXISTS idx_devis_statut ON public.devis(statut);
CREATE INDEX IF NOT EXISTS idx_devis_type_projet ON public.devis(type_projet);
CREATE INDEX IF NOT EXISTS idx_devis_source ON public.devis(source);
CREATE INDEX IF NOT EXISTS idx_devis_montant ON public.devis(montant_estime);
CREATE INDEX IF NOT EXISTS idx_devis_date_relance ON public.devis(date_relance DESC);
CREATE INDEX IF NOT EXISTS idx_devis_created_at ON public.devis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devis_numero ON public.devis(numero);

ALTER TABLE public.devis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devis_all_auth ON public.devis;
CREATE POLICY devis_all_auth ON public.devis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.devis TO authenticated;
GRANT ALL ON public.devis TO service_role;
