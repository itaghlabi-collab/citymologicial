-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Flotte véhicules (module Véhicules CITYMO)
-- Coller dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicule            TEXT,
  matricule_ww        TEXT,
  matricule           TEXT NOT NULL,
  type                TEXT,
  marque              TEXT,
  modele              TEXT,
  annee               INTEGER,
  couleur             TEXT,
  chauffeur           TEXT,
  departement         TEXT,
  responsable         TEXT,
  statut              TEXT NOT NULL DEFAULT 'disponible',
  assurance           TEXT,
  date_exp_assurance  DATE,
  visite_technique    TEXT,
  date_exp_visite     DATE,
  carte_grise         TEXT,
  km_actuel           NUMERIC(12, 2),
  carburant           TEXT,
  consommation        NUMERIC(8, 2),
  observations        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule_ww TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS marque TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS modele TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS couleur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'disponible';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS assurance TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_assurance DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS visite_technique TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_visite DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carte_grise TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS km_actuel NUMERIC(12, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carburant TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS consommation NUMERIC(8, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_statut_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_statut_check
  CHECK (statut IN ('disponible', 'affecte', 'intervention', 'hors_service', 'maintenance'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_unique
  ON public.vehicles (matricule);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_ww_unique
  ON public.vehicles (matricule_ww)
  WHERE matricule_ww IS NOT NULL AND TRIM(matricule_ww) <> '';

CREATE INDEX IF NOT EXISTS idx_vehicles_statut ON public.vehicles (statut);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles (type);
CREATE INDEX IF NOT EXISTS idx_vehicles_chauffeur ON public.vehicles (chauffeur);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON public.vehicles (created_at DESC);

DROP TRIGGER IF EXISTS vehicles_updated_at ON public.vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_all_auth ON public.vehicles;
CREATE POLICY vehicles_all_auth ON public.vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
