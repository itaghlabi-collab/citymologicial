-- Propositions marketing / commerciales
-- Prérequis : public.prospects (FK optionnelle)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.propositions_marketing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  prospect_id     UUID,
  type_projet     TEXT,
  objectif        TEXT,
  description     TEXT,
  budget_estime   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'brouillon',
  responsable     TEXT,
  commentaire     TEXT,
  date_envoi      DATE,
  date_relance    DATE,
  document_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS type_projet TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS date_envoi DATE;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS document_url TEXT;

ALTER TABLE public.propositions_marketing DROP CONSTRAINT IF EXISTS propositions_marketing_statut_check;
ALTER TABLE public.propositions_marketing
  ADD CONSTRAINT propositions_marketing_statut_check
  CHECK (statut IN ('brouillon', 'envoye', 'valide', 'refuse', 'en_revision'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'propositions_marketing_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.propositions_marketing
        ADD CONSTRAINT propositions_marketing_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS propositions_marketing_updated_at ON public.propositions_marketing;
CREATE TRIGGER propositions_marketing_updated_at
  BEFORE UPDATE ON public.propositions_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_propositions_marketing_statut ON public.propositions_marketing(statut);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_prospect_id ON public.propositions_marketing(prospect_id);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_type_projet ON public.propositions_marketing(type_projet);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_responsable ON public.propositions_marketing(responsable);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_date_envoi ON public.propositions_marketing(date_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_date_relance ON public.propositions_marketing(date_relance DESC);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_created_at ON public.propositions_marketing(created_at DESC);

ALTER TABLE public.propositions_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS propositions_marketing_all_auth ON public.propositions_marketing;
CREATE POLICY propositions_marketing_all_auth ON public.propositions_marketing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.propositions_marketing TO authenticated;
GRANT ALL ON public.propositions_marketing TO service_role;
