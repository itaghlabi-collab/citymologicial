-- Heures supplémentaires ouvriers — table overtime + FK workers
-- Exécuter après 20260525300000_workers_schema.sql

CREATE TABLE IF NOT EXISTS public.overtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  chantier        TEXT,
  heure_debut     TIME,
  heure_fin       TIME,
  nombre_heures   NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (nombre_heures >= 0),
  taux_horaire    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (taux_horaire >= 0),
  montant         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  motif           TEXT,
  statut          TEXT NOT NULL DEFAULT 'valide'
    CHECK (statut IN ('brouillon', 'valide', 'paye')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS overtime_updated_at ON public.overtime;
CREATE TRIGGER overtime_updated_at
  BEFORE UPDATE ON public.overtime
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_overtime_date ON public.overtime(date DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_worker_id ON public.overtime(worker_id);
CREATE INDEX IF NOT EXISTS idx_overtime_chantier ON public.overtime(chantier);
CREATE INDEX IF NOT EXISTS idx_overtime_statut ON public.overtime(statut);

ALTER TABLE public.overtime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS overtime_all_auth ON public.overtime;
CREATE POLICY overtime_all_auth ON public.overtime
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
