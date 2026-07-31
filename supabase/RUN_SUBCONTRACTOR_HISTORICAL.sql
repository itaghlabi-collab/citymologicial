-- =============================================================================
-- Situation sous-traitants — opérations historiques / already_accounted
-- Exécuter une fois dans le SQL Editor Supabase.
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ── Paiements ────────────────────────────────────────────────────────────────
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS already_accounted boolean NOT NULL DEFAULT false;
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS entered_at timestamptz;
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS entered_by uuid;
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS already_accounted_changed_at timestamptz;
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS already_accounted_changed_by uuid;
ALTER TABLE public.subcontractor_payments
  ADD COLUMN IF NOT EXISTS already_accounted_change_reason text;

COMMENT ON COLUMN public.subcontractor_payments.already_accounted IS
  'true = opération antérieure déjà comptabilisée hors ERP (pas de nouveau décaissement).';
COMMENT ON COLUMN public.subcontractor_payments.payment_date IS
  'Date réelle de l''opération (peut être antérieure à la mise en service ERP).';
COMMENT ON COLUMN public.subcontractor_payments.entered_at IS
  'Date de saisie dans l''ERP (distincte de payment_date).';

-- ── Avances globales ─────────────────────────────────────────────────────────
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS already_accounted boolean NOT NULL DEFAULT false;
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS entered_at timestamptz;
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS entered_by uuid;
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS already_accounted_changed_at timestamptz;
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS already_accounted_changed_by uuid;
ALTER TABLE public.subcontractor_global_advances
  ADD COLUMN IF NOT EXISTS already_accounted_change_reason text;

COMMENT ON COLUMN public.subcontractor_global_advances.already_accounted IS
  'true = avance historique déjà comptabilisée (aucun sync caisse ERP).';
COMMENT ON COLUMN public.subcontractor_global_advances.advance_date IS
  'Date réelle du versement d''avance.';
COMMENT ON COLUMN public.subcontractor_global_advances.entered_at IS
  'Date de saisie dans l''ERP.';

-- ── Situations (travaux) ─────────────────────────────────────────────────────
ALTER TABLE public.subcontractor_situations
  ADD COLUMN IF NOT EXISTS already_accounted boolean NOT NULL DEFAULT false;
ALTER TABLE public.subcontractor_situations
  ADD COLUMN IF NOT EXISTS entered_at timestamptz;
ALTER TABLE public.subcontractor_situations
  ADD COLUMN IF NOT EXISTS entered_by uuid;

-- Aligner is_historical historique éventuel
UPDATE public.subcontractor_situations
SET already_accounted = true
WHERE COALESCE(is_historical, false) = true
  AND COALESCE(already_accounted, false) = false;

-- ── Solde / situation d’ouverture ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  arretee_date date NOT NULL,
  travaux_anterieurs numeric(14, 2) NOT NULL DEFAULT 0 CHECK (travaux_anterieurs >= 0),
  avances_versees_anterieures numeric(14, 2) NOT NULL DEFAULT 0 CHECK (avances_versees_anterieures >= 0),
  avances_consommees_anterieures numeric(14, 2) NOT NULL DEFAULT 0 CHECK (avances_consommees_anterieures >= 0),
  solde_avance_ouverture numeric(14, 2) NOT NULL DEFAULT 0 CHECK (solde_avance_ouverture >= 0),
  paiements_anterieurs numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paiements_anterieurs >= 0),
  reste_anterieur numeric(14, 2) NOT NULL DEFAULT 0 CHECK (reste_anterieur >= 0),
  retenues_anterieures numeric(14, 2) NOT NULL DEFAULT 0 CHECK (retenues_anterieures >= 0),
  observation text,
  piece_url text,
  already_accounted boolean NOT NULL DEFAULT true,
  linked_advance_id uuid REFERENCES public.subcontractor_global_advances(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontractor_opening_balances_one_per_st UNIQUE (subcontractor_id),
  CONSTRAINT subcontractor_opening_balances_conso_lte_versees
    CHECK (avances_consommees_anterieures <= avances_versees_anterieures + 0.009)
);

CREATE INDEX IF NOT EXISTS idx_st_opening_balances_sub
  ON public.subcontractor_opening_balances (subcontractor_id);

COMMENT ON TABLE public.subcontractor_opening_balances IS
  'Situation d''ouverture du compte sous-traitant (solde d''ouverture, déjà comptabilisé).';

-- Backfill entered_at depuis created_at si vide
UPDATE public.subcontractor_payments
SET entered_at = created_at
WHERE entered_at IS NULL AND created_at IS NOT NULL;

UPDATE public.subcontractor_global_advances
SET entered_at = created_at
WHERE entered_at IS NULL AND created_at IS NOT NULL;

UPDATE public.subcontractor_situations
SET entered_at = created_at
WHERE entered_at IS NULL AND created_at IS NOT NULL;
