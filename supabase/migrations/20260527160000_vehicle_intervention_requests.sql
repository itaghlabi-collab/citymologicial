-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Demandes d'intervention véhicules
-- Prérequis : table public.vehicles (20260527150000_logistique_vehicles.sql)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   TEXT NOT NULL UNIQUE,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  departement           TEXT,
  type_intervention     TEXT NOT NULL,
  description           TEXT,
  priorite              TEXT NOT NULL DEFAULT 'normale',
  date_demande          DATE,
  date_prevue           DATE,
  statut                TEXT NOT NULL DEFAULT 'en_attente',
  cout_estime           NUMERIC(12, 2),
  garage                TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_prevue DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS cout_estime NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS garage TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_priorite_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_priorite_check
  CHECK (priorite IN ('faible', 'normale', 'urgente', 'critique', 'basse', 'haute'));

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_statut_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_statut_check
  CHECK (statut IN ('en_attente', 'diagnostic', 'en_cours', 'termine', 'annule'));

CREATE INDEX IF NOT EXISTS idx_vir_vehicle_id ON public.vehicle_intervention_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vir_matricule ON public.vehicle_intervention_requests(matricule);
CREATE INDEX IF NOT EXISTS idx_vir_chauffeur ON public.vehicle_intervention_requests(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vir_statut ON public.vehicle_intervention_requests(statut);
CREATE INDEX IF NOT EXISTS idx_vir_priorite ON public.vehicle_intervention_requests(priorite);
CREATE INDEX IF NOT EXISTS idx_vir_date_demande ON public.vehicle_intervention_requests(date_demande DESC);
CREATE INDEX IF NOT EXISTS idx_vir_created_at ON public.vehicle_intervention_requests(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_requests_updated_at ON public.vehicle_intervention_requests;
CREATE TRIGGER vehicle_intervention_requests_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_intervention_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests;
CREATE POLICY vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_intervention_requests TO authenticated;
GRANT ALL ON public.vehicle_intervention_requests TO service_role;
