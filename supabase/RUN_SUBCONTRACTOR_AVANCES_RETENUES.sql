-- =============================================================================
-- CITYMO — Avances & retenues sous-traitants (projet + sous-traitant)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent
--
-- PRÉREQUIS : RUN_SUBCONTRACTORS.sql + RUN_SUBCONTRACTOR_PAYMENTS_EXTEND.sql
-- =============================================================================

-- Colonnes sur les paiements (montant brut / net)
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS avances NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS retenues NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Rétrocompat : gross = amount si non renseigné
UPDATE public.subcontractor_payments
SET gross_amount = amount
WHERE gross_amount = 0 AND amount > 0;

-- Table des avances / retenues enregistrées (en attente de déduction)
CREATE TABLE IF NOT EXISTS public.subcontractor_project_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id  UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  adjustment_type   TEXT NOT NULL CHECK (adjustment_type IN ('avance', 'retenue')),
  amount            NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  description       TEXT,
  adjustment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'cancelled')),
  applied_payment_id UUID REFERENCES public.subcontractor_payments(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_adj_sub_project
  ON public.subcontractor_project_adjustments (subcontractor_id, project_id);
CREATE INDEX IF NOT EXISTS idx_spa_adj_status
  ON public.subcontractor_project_adjustments (status);
CREATE INDEX IF NOT EXISTS idx_spa_adj_type
  ON public.subcontractor_project_adjustments (adjustment_type);

DROP TRIGGER IF EXISTS spa_adj_updated_at ON public.subcontractor_project_adjustments;
CREATE TRIGGER spa_adj_updated_at
  BEFORE UPDATE ON public.subcontractor_project_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subcontractor_project_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spa_adj_auth ON public.subcontractor_project_adjustments;
CREATE POLICY spa_adj_auth ON public.subcontractor_project_adjustments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Vérification
SELECT column_name, 'OK' AS status
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subcontractor_payments'
  AND column_name IN ('gross_amount', 'avances', 'retenues')
UNION ALL
SELECT 'subcontractor_project_adjustments', 'OK'
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'subcontractor_project_adjustments';
