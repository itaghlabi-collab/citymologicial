-- =============================================================================
-- CITYMO — Paiement ouvriers v2 (projet + jours × 8h × tarif + heures sup)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent
--
-- PRÉREQUIS : table public.payroll (rh_schema) + table public.workers
-- Si jamais exécuté : migrations 20260525000000_rh_schema + 20260525300000_workers
-- =============================================================================

-- ─── Colonnes ouvriers (migration workers_extend) ─────────────────────────────
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS chantier TEXT,
  ADD COLUMN IF NOT EXISTS jours_travailles NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_journalier NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenues NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ─── Colonnes v2 (projet + lot + tarif horaire) ──────────────────────────────
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS tarif_horaire NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS batch_id UUID;

-- semaine optionnelle si legacy sans semaine
ALTER TABLE public.payroll ALTER COLUMN semaine_debut DROP NOT NULL;
ALTER TABLE public.payroll ALTER COLUMN semaine_fin DROP NOT NULL;

-- ─── Statuts UI : En attente, Payé, Partiellement payé, Annulé ───────────────
ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_statut_check;
ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_statut_check
  CHECK (statut IN (
    'Brouillon', 'Valide', 'En attente', 'Paye',
    'Partiellement paye', 'Annule'
  ));

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payroll_worker_id ON public.payroll(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_chantier ON public.payroll(chantier);
CREATE INDEX IF NOT EXISTS idx_payroll_statut ON public.payroll(statut);
CREATE INDEX IF NOT EXISTS idx_payroll_project_id ON public.payroll(project_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_date ON public.payroll(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_batch_id ON public.payroll(batch_id);

NOTIFY pgrst, 'reload schema';

-- ─── Vérification (résultat attendu : 7 lignes « OK ») ───────────────────────
SELECT
  c.column_name,
  CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM (VALUES
  ('project_id'), ('payment_date'), ('tarif_horaire'), ('batch_id'),
  ('jours_travailles'), ('tarif_heures_sup'), ('montant_heures_sup'),
  ('avances'), ('retenues'), ('chantier')
) AS expected(column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'payroll'
 AND c.column_name = expected.column_name
ORDER BY expected.column_name;
