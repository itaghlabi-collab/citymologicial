-- Planning commercial — rendez-vous (prevu + terrain)
-- Coller ce fichier en entier dans Supabase SQL Editor
-- Prérequis : public.prospects (20260525700000_prospects.sql)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.planning_commercial (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdv_type            TEXT NOT NULL DEFAULT 'prevu'
    CHECK (rdv_type IN ('prevu', 'rapide')),
  titre               TEXT NOT NULL,
  type_rdv            TEXT,
  date                DATE NOT NULL,
  heure               TIME,
  lieu                TEXT,
  prospect_id         UUID,
  type_projet         TEXT,
  secteur             TEXT,
  societe             TEXT,
  statut              TEXT NOT NULL DEFAULT 'planifie'
    CHECK (statut IN ('planifie', 'confirme', 'realise', 'annule', 'reporte')),
  priorite            TEXT NOT NULL DEFAULT 'normale'
    CHECK (priorite IN ('basse', 'normale', 'haute')),
  responsable         TEXT,
  assigne_id          UUID,
  notes               TEXT,
  actions_suivantes   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS rdv_type TEXT NOT NULL DEFAULT 'prevu';
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS type_rdv TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS heure TIME;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS type_projet TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS secteur TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS societe TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS assigne_id UUID;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS actions_suivantes TEXT;

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_rdv_type_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_rdv_type_check
  CHECK (rdv_type IN ('prevu', 'rapide'));

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_statut_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_statut_check
  CHECK (statut IN ('planifie', 'confirme', 'realise', 'annule', 'reporte'));

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_priorite_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_priorite_check
  CHECK (priorite IN ('basse', 'normale', 'haute'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_commercial_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.planning_commercial
        ADD CONSTRAINT planning_commercial_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS planning_commercial_updated_at ON public.planning_commercial;
CREATE TRIGGER planning_commercial_updated_at
  BEFORE UPDATE ON public.planning_commercial
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_planning_commercial_date ON public.planning_commercial(date DESC);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_statut ON public.planning_commercial(statut);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_rdv_type ON public.planning_commercial(rdv_type);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_prospect_id ON public.planning_commercial(prospect_id);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_type_rdv ON public.planning_commercial(type_rdv);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_responsable ON public.planning_commercial(responsable);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_created_at ON public.planning_commercial(created_at DESC);

ALTER TABLE public.planning_commercial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_commercial_all_auth ON public.planning_commercial;
CREATE POLICY planning_commercial_all_auth ON public.planning_commercial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.planning_commercial TO authenticated;
GRANT ALL ON public.planning_commercial TO service_role;
