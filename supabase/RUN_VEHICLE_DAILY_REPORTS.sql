-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Comptes rendus journaliers véhicules (déplacements du jour)
-- Prérequis : table public.vehicles
-- Coller dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- En-tête compte rendu (1 par véhicule / jour)
CREATE TABLE IF NOT EXISTS public.vehicle_daily_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             TEXT NOT NULL UNIQUE,
  vehicle_id      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  matricule       TEXT,
  vehicule_label  TEXT,
  chauffeur       TEXT,
  date_rapport    DATE NOT NULL,
  km_depart       NUMERIC(12, 2),
  km_arrivee      NUMERIC(12, 2),
  km_parcourus    NUMERIC(12, 2),
  carburant_litres NUMERIC(8, 2),
  observations    TEXT,
  statut          TEXT NOT NULL DEFAULT 'valide',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_daily_reports_statut_check
    CHECK (statut IN ('brouillon', 'valide')),
  CONSTRAINT vehicle_daily_reports_vehicle_date_unique UNIQUE (vehicle_id, date_rapport)
);

-- Lignes de déplacement
CREATE TABLE IF NOT EXISTS public.vehicle_daily_trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES public.vehicle_daily_reports(id) ON DELETE CASCADE,
  ordre           INTEGER NOT NULL DEFAULT 1,
  heure_depart    TIME,
  heure_arrivee   TIME,
  lieu_depart     TEXT,
  lieu_arrivee    TEXT,
  objet_mission   TEXT,
  projet_ref      TEXT,
  projet_nom      TEXT,
  km_parcourus    NUMERIC(10, 2),
  observations    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vdr_vehicle_id ON public.vehicle_daily_reports(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vdr_date ON public.vehicle_daily_reports(date_rapport DESC);
CREATE INDEX IF NOT EXISTS idx_vdr_matricule ON public.vehicle_daily_reports(matricule);
CREATE INDEX IF NOT EXISTS idx_vdt_report_id ON public.vehicle_daily_trips(report_id);

DROP TRIGGER IF EXISTS vehicle_daily_reports_updated_at ON public.vehicle_daily_reports;
CREATE TRIGGER vehicle_daily_reports_updated_at
  BEFORE UPDATE ON public.vehicle_daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_daily_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_daily_reports_auth ON public.vehicle_daily_reports;
CREATE POLICY vehicle_daily_reports_auth ON public.vehicle_daily_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vehicle_daily_trips_auth ON public.vehicle_daily_trips;
CREATE POLICY vehicle_daily_trips_auth ON public.vehicle_daily_trips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_daily_reports TO authenticated, service_role;
GRANT ALL ON public.vehicle_daily_trips TO authenticated, service_role;
