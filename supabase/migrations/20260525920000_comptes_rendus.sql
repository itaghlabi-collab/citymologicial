-- Comptes rendus commerciaux (visites, RDV, réunions chantier)
-- Prérequis : public.prospects, public.planning_commercial (FK optionnelles)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.comptes_rendus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre               TEXT,
  planning_rdv_id     UUID,
  prospect_id         UUID,
  date                DATE NOT NULL,
  resume              TEXT NOT NULL,
  decision            TEXT,
  prochaine_action    TEXT,
  responsable         TEXT,
  chantier_projet     TEXT,
  type_visite         TEXT,
  besoins_client      TEXT,
  problemes_detectes  TEXT,
  statut_suivi        TEXT NOT NULL DEFAULT 'en_attente',
  documents_url       TEXT,
  assigne_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS planning_rdv_id UUID;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS chantier_projet TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS type_visite TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS besoins_client TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS problemes_detectes TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS statut_suivi TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS documents_url TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS assigne_id UUID;

ALTER TABLE public.comptes_rendus DROP CONSTRAINT IF EXISTS comptes_rendus_statut_suivi_check;
ALTER TABLE public.comptes_rendus
  ADD CONSTRAINT comptes_rendus_statut_suivi_check
  CHECK (statut_suivi IN ('en_attente', 'en_cours', 'cloture'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptes_rendus_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.comptes_rendus
        ADD CONSTRAINT comptes_rendus_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptes_rendus_planning_rdv_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'planning_commercial'
    ) THEN
      ALTER TABLE public.comptes_rendus
        ADD CONSTRAINT comptes_rendus_planning_rdv_id_fkey
        FOREIGN KEY (planning_rdv_id) REFERENCES public.planning_commercial(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS comptes_rendus_updated_at ON public.comptes_rendus;
CREATE TRIGGER comptes_rendus_updated_at
  BEFORE UPDATE ON public.comptes_rendus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_comptes_rendus_date ON public.comptes_rendus(date DESC);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_prospect_id ON public.comptes_rendus(prospect_id);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_planning_rdv_id ON public.comptes_rendus(planning_rdv_id);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_responsable ON public.comptes_rendus(responsable);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_statut_suivi ON public.comptes_rendus(statut_suivi);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_chantier_projet ON public.comptes_rendus(chantier_projet);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_created_at ON public.comptes_rendus(created_at DESC);

ALTER TABLE public.comptes_rendus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comptes_rendus_all_auth ON public.comptes_rendus;
CREATE POLICY comptes_rendus_all_auth ON public.comptes_rendus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.comptes_rendus TO authenticated;
GRANT ALL ON public.comptes_rendus TO service_role;
