-- ═══════════════════════════════════════════════════════════════════════════
-- INTERVENTIONS CITYMO — TOUT EN UN (SQL Editor → Run)
-- Prérequis : table public.vehicles déjà créée (RUN_VEHICULES_COMPLET.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1/2 : 20260527160000_vehicle_intervention_requests.sql ───

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

-- ─── 2/2 : 20260527170000_vehicle_intervention_history.sql ───

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID UNIQUE REFERENCES public.vehicle_intervention_requests(id) ON DELETE CASCADE,
  ref                   TEXT NOT NULL,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  type_intervention     TEXT,
  description           TEXT,
  priorite              TEXT,
  date_demande          DATE,
  date_intervention     DATE,
  date_fin              DATE,
  cout_final            NUMERIC(12, 2),
  prestataire           TEXT,
  observation_finale    TEXT,
  statut                TEXT NOT NULL DEFAULT 'termine',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS priorite TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_intervention DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS cout_final NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS prestataire TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS observation_finale TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'termine';
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_history DROP CONSTRAINT IF EXISTS vehicle_intervention_history_statut_check;
ALTER TABLE public.vehicle_intervention_history
  ADD CONSTRAINT vehicle_intervention_history_statut_check
  CHECK (statut IN ('termine', 'annule'));

CREATE INDEX IF NOT EXISTS idx_vih_request_id ON public.vehicle_intervention_history(request_id);
CREATE INDEX IF NOT EXISTS idx_vih_vehicle_id ON public.vehicle_intervention_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vih_matricule ON public.vehicle_intervention_history(matricule);
CREATE INDEX IF NOT EXISTS idx_vih_chauffeur ON public.vehicle_intervention_history(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vih_type ON public.vehicle_intervention_history(type_intervention);
CREATE INDEX IF NOT EXISTS idx_vih_date_fin ON public.vehicle_intervention_history(date_fin DESC);
CREATE INDEX IF NOT EXISTS idx_vih_created_at ON public.vehicle_intervention_history(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_history_updated_at ON public.vehicle_intervention_history;
CREATE TRIGGER vehicle_intervention_history_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_intervention_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_intervention_history_all_auth ON public.vehicle_intervention_history;
CREATE POLICY vehicle_intervention_history_all_auth ON public.vehicle_intervention_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_intervention_history TO authenticated;
GRANT ALL ON public.vehicle_intervention_history TO service_role;

-- Vérification
SELECT COUNT(*) AS tables_pretes FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vehicle_intervention_requests', 'vehicle_intervention_history');
