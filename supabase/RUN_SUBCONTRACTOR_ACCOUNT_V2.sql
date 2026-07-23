-- =============================================================================
-- CITYMO — Compte sous-traitant V2 (situations, avances globales, imputations)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent / ADDITIF uniquement — ne supprime aucune donnée
--
-- PRÉREQUIS : RUN_SUBCONTRACTORS.sql + RUN_SUBCONTRACTOR_PAYMENTS_EXTEND.sql
--             + RUN_SUBCONTRACTOR_AVANCES_RETENUES.sql
--
-- Règles métier couvertes côté schéma :
-- - 1 avance = 1 sync caisse (source_type subcontractor_advance / source_id = advance.id)
-- - imputation = analytique uniquement (pas de FK caisse)
-- - paiements existants conservés + liaison optionnelle situation_id
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ─── 1. Situations (plusieurs par projet / sous-traitant) ─────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_situations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  assignment_id      UUID REFERENCES public.subcontractor_project_assignments(id) ON DELETE SET NULL,
  reference          TEXT,
  designation        TEXT,
  payment_type       TEXT
    CHECK (payment_type IS NULL OR payment_type IN ('metre', 'tache', 'service')),
  quantity           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit               TEXT,
  unit_price         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gross_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  avances_imputees   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (avances_imputees >= 0),
  retenues           NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (retenues >= 0),
  amount_paid        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status             TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN (
      'draft', 'in_progress', 'partially_paid', 'settled', 'closed', 'cancelled'
    )),
  situation_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at          TIMESTAMPTZ,
  closed_by          UUID,
  notes              TEXT,
  is_historical      BOOLEAN NOT NULL DEFAULT FALSE,
  group_id           UUID,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent si la table existait déjà sans group_id
ALTER TABLE public.subcontractor_situations
  ADD COLUMN IF NOT EXISTS group_id UUID;
CREATE INDEX IF NOT EXISTS idx_sub_sit_group
  ON public.subcontractor_situations (group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_sit_sub
  ON public.subcontractor_situations (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_sit_project
  ON public.subcontractor_situations (project_id);
CREATE INDEX IF NOT EXISTS idx_sub_sit_status
  ON public.subcontractor_situations (status);
CREATE INDEX IF NOT EXISTS idx_sub_sit_date
  ON public.subcontractor_situations (situation_date DESC);

DROP TRIGGER IF EXISTS sub_situations_updated_at ON public.subcontractor_situations;
CREATE TRIGGER sub_situations_updated_at
  BEFORE UPDATE ON public.subcontractor_situations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subcontractor_situations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_situations_auth ON public.subcontractor_situations;
CREATE POLICY sub_situations_auth ON public.subcontractor_situations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Liaison paiement → situation (additive)
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS situation_id UUID
  REFERENCES public.subcontractor_situations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_payments_situation
  ON public.subcontractor_payments (situation_id);

-- ─── 2. Avances globales (appartiennent au sous-traitant) ─────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_global_advances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  advance_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  amount             NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  consumed_amount    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  payment_method     TEXT,
  reference          TEXT,
  observation        TEXT,
  status             TEXT NOT NULL DEFAULT 'unused'
    CHECK (status IN ('unused', 'partial', 'consumed', 'cancelled')),
  created_by         UUID,
  cancelled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sub_adv_consumed_lte_amount CHECK (consumed_amount <= amount)
);

CREATE INDEX IF NOT EXISTS idx_sub_adv_sub
  ON public.subcontractor_global_advances (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_adv_status
  ON public.subcontractor_global_advances (status);
CREATE INDEX IF NOT EXISTS idx_sub_adv_date
  ON public.subcontractor_global_advances (advance_date DESC);

DROP TRIGGER IF EXISTS sub_advances_updated_at ON public.subcontractor_global_advances;
CREATE TRIGGER sub_advances_updated_at
  BEFORE UPDATE ON public.subcontractor_global_advances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subcontractor_global_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_advances_auth ON public.subcontractor_global_advances;
CREATE POLICY sub_advances_auth ON public.subcontractor_global_advances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 3. Imputations analytiques (PAS de sync caisse) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_advance_imputations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id         UUID NOT NULL REFERENCES public.subcontractor_global_advances(id) ON DELETE RESTRICT,
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  situation_id       UUID REFERENCES public.subcontractor_situations(id) ON DELETE SET NULL,
  project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  payment_id         UUID REFERENCES public.subcontractor_payments(id) ON DELETE SET NULL,
  amount             NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reliquat_after     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (reliquat_after >= 0),
  imputation_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  observation        TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_imp_advance
  ON public.subcontractor_advance_imputations (advance_id);
CREATE INDEX IF NOT EXISTS idx_sub_imp_sub
  ON public.subcontractor_advance_imputations (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_imp_situation
  ON public.subcontractor_advance_imputations (situation_id);
CREATE INDEX IF NOT EXISTS idx_sub_imp_date
  ON public.subcontractor_advance_imputations (imputation_date DESC);

ALTER TABLE public.subcontractor_advance_imputations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_imputations_auth ON public.subcontractor_advance_imputations;
CREATE POLICY sub_imputations_auth ON public.subcontractor_advance_imputations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 4. Journal d’événements du compte ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_account_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id   UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL,
  event_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  situation_id       UUID REFERENCES public.subcontractor_situations(id) ON DELETE SET NULL,
  advance_id         UUID REFERENCES public.subcontractor_global_advances(id) ON DELETE SET NULL,
  payment_id         UUID REFERENCES public.subcontractor_payments(id) ON DELETE SET NULL,
  amount             NUMERIC(14, 2) DEFAULT 0,
  reference          TEXT,
  observation        TEXT,
  user_id            UUID,
  user_label         TEXT,
  meta               JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_evt_sub_date
  ON public.subcontractor_account_events (subcontractor_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_sub_evt_type
  ON public.subcontractor_account_events (event_type);

ALTER TABLE public.subcontractor_account_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_events_auth ON public.subcontractor_account_events;
CREATE POLICY sub_events_auth ON public.subcontractor_account_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 5. Backfill situations depuis paiements existants (historique) ──────────
-- Une situation par paiement sans situation_id — ne recalcule rien, conserve les montants.
INSERT INTO public.subcontractor_situations (
  subcontractor_id, project_id, assignment_id, reference, designation,
  payment_type, quantity, unit, unit_price, gross_amount,
  avances_imputees, retenues, amount_paid, status, situation_date,
  notes, is_historical, created_at, updated_at
)
SELECT
  p.subcontractor_id,
  p.project_id,
  p.assignment_id,
  COALESCE(NULLIF(TRIM(p.reference), ''), 'HIST-' || LEFT(p.id::text, 8)),
  COALESCE(NULLIF(TRIM(p.designation), ''), NULLIF(TRIM(p.description), ''), 'Paiement historique'),
  p.payment_type,
  COALESCE(p.quantity, 0),
  p.unit,
  COALESCE(p.unit_price, 0),
  COALESCE(NULLIF(p.gross_amount, 0), p.amount, 0),
  COALESCE(p.avances, 0),
  COALESCE(p.retenues, 0),
  CASE WHEN p.status = 'paid' THEN COALESCE(p.amount, 0) ELSE 0 END,
  CASE
    WHEN p.status = 'cancelled' THEN 'cancelled'
    WHEN p.status = 'paid' THEN 'settled'
    WHEN p.status = 'partial' THEN 'partially_paid'
    ELSE 'in_progress'
  END,
  COALESCE(p.payment_date, CURRENT_DATE),
  'Donnée historique — situation générée depuis un paiement existant',
  TRUE,
  COALESCE(p.created_at, NOW()),
  COALESCE(p.updated_at, NOW())
FROM public.subcontractor_payments p
WHERE p.situation_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.subcontractor_situations s
    WHERE s.is_historical = TRUE
      AND s.notes LIKE 'Donnée historique%'
      AND s.subcontractor_id = p.subcontractor_id
      AND s.created_at = p.created_at
      AND COALESCE(s.gross_amount, 0) = COALESCE(NULLIF(p.gross_amount, 0), p.amount, 0)
      AND COALESCE(s.reference, '') = COALESCE(NULLIF(TRIM(p.reference), ''), 'HIST-' || LEFT(p.id::text, 8))
  );

-- Relier chaque paiement historique à sa situation (meilleur match 1:1 par id via temp)
UPDATE public.subcontractor_payments p
SET situation_id = s.id
FROM public.subcontractor_situations s
WHERE p.situation_id IS NULL
  AND s.is_historical = TRUE
  AND s.subcontractor_id = p.subcontractor_id
  AND COALESCE(s.project_id::text, '') = COALESCE(p.project_id::text, '')
  AND COALESCE(s.gross_amount, 0) = COALESCE(NULLIF(p.gross_amount, 0), p.amount, 0)
  AND COALESCE(s.situation_date, CURRENT_DATE) = COALESCE(p.payment_date, CURRENT_DATE)
  AND ABS(EXTRACT(EPOCH FROM (s.created_at - COALESCE(p.created_at, s.created_at)))) < 2;

NOTIFY pgrst, 'reload schema';

-- Vérification
SELECT 'subcontractor_situations' AS objet, COUNT(*)::text AS n FROM public.subcontractor_situations
UNION ALL
SELECT 'subcontractor_global_advances', COUNT(*)::text FROM public.subcontractor_global_advances
UNION ALL
SELECT 'subcontractor_advance_imputations', COUNT(*)::text FROM public.subcontractor_advance_imputations
UNION ALL
SELECT 'subcontractor_account_events', COUNT(*)::text FROM public.subcontractor_account_events
UNION ALL
SELECT 'payments_with_situation', COUNT(*)::text FROM public.subcontractor_payments WHERE situation_id IS NOT NULL;
