-- =============================================================================
-- CITYMO — Paiement ouvriers v2 (projet + heures × tarif horaire)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent
-- =============================================================================

ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS tarif_horaire NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_payroll_project_id ON public.payroll(project_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_date ON public.payroll(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_batch_id ON public.payroll(batch_id);

-- semaine optionnelle (legacy)
ALTER TABLE public.payroll ALTER COLUMN semaine_debut DROP NOT NULL;
ALTER TABLE public.payroll ALTER COLUMN semaine_fin DROP NOT NULL;

ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_statut_check;
ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_statut_check
  CHECK (statut IN (
    'Brouillon', 'Valide', 'En attente', 'Paye',
    'Partiellement paye', 'Annule'
  ));

NOTIFY pgrst, 'reload schema';
