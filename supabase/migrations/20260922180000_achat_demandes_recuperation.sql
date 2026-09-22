-- Achats — demandes de récupération (qui / quand / quoi)
-- Voir aussi supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.achat_demandes_recuperation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             TEXT UNIQUE,
  qui             TEXT NOT NULL,
  quand           DATE NOT NULL,
  quoi            TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'a_recuperer',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT achat_demandes_recuperation_statut_check
    CHECK (statut IN ('a_recuperer', 'recuperee', 'annulee'))
);

ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS qui TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS quand DATE;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS quoi TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'a_recuperer';
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS created_by UUID;

DROP TRIGGER IF EXISTS achat_demandes_recuperation_updated_at ON public.achat_demandes_recuperation;
CREATE TRIGGER achat_demandes_recuperation_updated_at
  BEFORE UPDATE ON public.achat_demandes_recuperation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_achat_dem_recup_statut ON public.achat_demandes_recuperation (statut);
CREATE INDEX IF NOT EXISTS idx_achat_dem_recup_quand ON public.achat_demandes_recuperation (quand DESC);
CREATE INDEX IF NOT EXISTS idx_achat_dem_recup_created ON public.achat_demandes_recuperation (created_at DESC);

ALTER TABLE public.achat_demandes_recuperation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS achat_demandes_recuperation_all_auth ON public.achat_demandes_recuperation;
CREATE POLICY achat_demandes_recuperation_all_auth ON public.achat_demandes_recuperation
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.achat_demandes_recuperation TO authenticated;
GRANT ALL ON public.achat_demandes_recuperation TO service_role;
