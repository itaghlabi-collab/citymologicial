-- =============================================================================
-- CITYMO — Mises à jour récentes (CRM + RH ouvriers + sous-traitants)
-- Supabase Dashboard → SQL Editor → coller tout → Run
-- Idempotent : safe à relancer
--
-- ORDRE SI PREMIÈRE INSTALL RH :
--   1. RUN_PRESENCE_COMPLET.sql        (workers + attendance)
--   2. RUN_PAYROLL_V2.sql              (payroll ouvriers)
--   3. RUN_SUBCONTRACTORS.sql          (sous-traitants base)
--   4. Ce script (RUN_UPDATES_RECENTES.sql)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- A. CRM — Références courtes articles (E001, CL001, …)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_reference_unique
  ON public.articles (reference)
  WHERE reference IS NOT NULL AND reference <> '';

-- ═══════════════════════════════════════════════════════════════════════════
-- B. OUVRIERS — Tarif horaire + unité (base tarif journalier = × 8)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS tarif_unite TEXT DEFAULT 'heure';

COMMENT ON COLUMN public.workers.tarif IS 'Tarif de base ouvrier';
COMMENT ON COLUMN public.workers.tarif_unite IS 'Unité : heure (défaut), jour, semaine, mois';

UPDATE public.workers
SET tarif_unite = 'heure'
WHERE tarif_unite IS NULL OR TRIM(tarif_unite) = '';

-- ═══════════════════════════════════════════════════════════════════════════
-- C. PAYROLL OUVRIERS — Colonnes paiement hebdo (jours × tarif/j + h.sup)
--    (Ignoré si déjà exécuté via RUN_PAYROLL_V2.sql)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS chantier TEXT,
  ADD COLUMN IF NOT EXISTS jours_travailles NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_journalier NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenues NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS tarif_horaire NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Référence + mode de paiement (PDF fiche ouvrier)
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Chef de projet / chantier + flag génération auto depuis présences
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS chef_chantier_nom TEXT;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS chef_projet TEXT;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

ALTER TABLE public.payroll ALTER COLUMN semaine_debut DROP NOT NULL;
ALTER TABLE public.payroll ALTER COLUMN semaine_fin DROP NOT NULL;

ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_statut_check;
ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_statut_check
  CHECK (statut IN (
    'Brouillon', 'Valide', 'En attente', 'Paye',
    'Partiellement paye', 'Annule'
  ));

CREATE INDEX IF NOT EXISTS idx_payroll_worker_id ON public.payroll(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_project_id ON public.payroll(project_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_date ON public.payroll(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_batch_id ON public.payroll(batch_id);

-- Rétrocompat : tarif journalier = tarif horaire × 8 si manquant
UPDATE public.payroll
SET tarif_journalier = ROUND(tarif_horaire * 8, 2)
WHERE worker_id IS NOT NULL
  AND (tarif_journalier IS NULL OR tarif_journalier = 0)
  AND tarif_horaire > 0;

UPDATE public.payroll
SET tarif_horaire = ROUND(tarif_journalier / 8, 2)
WHERE worker_id IS NOT NULL
  AND (tarif_horaire IS NULL OR tarif_horaire = 0)
  AND tarif_journalier > 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- D. PRÉSENCE — Index pour calcul jours travaillés (paiement hebdo)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_attendance_worker_project_date
  ON public.attendance (worker_id, project_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON public.attendance (date DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- E. HEURES SUP — Index pour agrégation hebdomadaire
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_overtime_worker_date
  ON public.overtime (worker_id, date);

-- ═══════════════════════════════════════════════════════════════════════════
-- F. SOUS-TRAITANTS — Paiements (Situation sous-traitants)
--    Nécessite RUN_SUBCONTRACTORS.sql exécuté au préalable
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subcontractor_payments'
  ) THEN
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS payment_type TEXT;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS designation TEXT;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit TEXT;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS avances NUMERIC(14, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS retenues NUMERIC(14, 2) NOT NULL DEFAULT 0;

    ALTER TABLE public.subcontractor_payments DROP CONSTRAINT IF EXISTS subcontractor_payments_payment_type_check;
    ALTER TABLE public.subcontractor_payments
      ADD CONSTRAINT subcontractor_payments_payment_type_check
      CHECK (payment_type IS NULL OR payment_type IN ('metre', 'tache', 'service'));

    ALTER TABLE public.subcontractor_payments DROP CONSTRAINT IF EXISTS subcontractor_payments_status_check;
    ALTER TABLE public.subcontractor_payments
      ADD CONSTRAINT subcontractor_payments_status_check
      CHECK (status IN ('paid', 'pending', 'partial', 'cancelled'));

    UPDATE public.subcontractor_payments
    SET gross_amount = amount
    WHERE gross_amount = 0 AND amount > 0;
  END IF;
END $$;

-- Table avances / retenues sous-traitants (si absente)
CREATE TABLE IF NOT EXISTS public.subcontractor_project_adjustments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  adjustment_type    TEXT NOT NULL CHECK (adjustment_type IN ('avance', 'retenue')),
  amount             NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  description        TEXT,
  adjustment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status             TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'cancelled')),
  applied_payment_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_adj_sub_project
  ON public.subcontractor_project_adjustments (subcontractor_id, project_id);

ALTER TABLE public.subcontractor_project_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spa_adj_auth ON public.subcontractor_project_adjustments;
CREATE POLICY spa_adj_auth ON public.subcontractor_project_adjustments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- E. TÂCHES — Historique relances Directeur
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.internal_task_dg_relances (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
  sent_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message    TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_task_dg_relances_task_id
  ON public.internal_task_dg_relances (task_id, sent_at DESC);

ALTER TABLE public.internal_task_dg_relances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_task_dg_relances_auth ON public.internal_task_dg_relances;
CREATE POLICY internal_task_dg_relances_auth ON public.internal_task_dg_relances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.internal_task_dg_relances TO authenticated;
GRANT ALL ON public.internal_task_dg_relances TO service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'articles.reference' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'reference'
  ) THEN 'OK' ELSE 'MANQUANT' END AS status
UNION ALL
SELECT 'payroll.tarif_journalier',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll' AND column_name = 'tarif_journalier'
  ) THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'payroll.reference',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll' AND column_name = 'reference'
  ) THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'attendance index',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_attendance_worker_project_date'
  ) THEN 'OK' ELSE 'MANQUANT' END
UNION ALL
SELECT 'subcontractor_payments.gross_amount',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractor_payments' AND column_name = 'gross_amount'
  ) THEN 'OK' ELSE 'MANQUANT (exécuter RUN_SUBCONTRACTORS.sql)' END
UNION ALL
SELECT 'internal_task_dg_relances',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'internal_task_dg_relances'
  ) THEN 'OK' ELSE 'MANQUANT (exécuter RUN_INTERNAL_TASKS_DG_RELANCES.sql)' END;
