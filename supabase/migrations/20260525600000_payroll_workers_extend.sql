-- Paiement ouvriers — extension table payroll pour workers externes
-- Exécuter après 20260525300000_workers_schema.sql

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS chantier TEXT,
  ADD COLUMN IF NOT EXISTS jours_travailles NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_journalier NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenues NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll
  DROP CONSTRAINT IF EXISTS payroll_statut_check;

ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_statut_check
  CHECK (statut IN ('Brouillon', 'Valide', 'En attente', 'Paye'));

CREATE INDEX IF NOT EXISTS idx_payroll_worker_id ON public.payroll(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_chantier ON public.payroll(chantier);
CREATE INDEX IF NOT EXISTS idx_payroll_statut ON public.payroll(statut);
