-- Sync automatique feuille de caisse ← modules source
-- source_type + source_id : clé idempotente (pas de doublon)

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS is_auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_source_unique
  ON public.finance_transactions (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Rétro-compat : lignes charge / ordre déjà synchronisées
UPDATE public.finance_transactions
SET
  source_type = 'charge',
  source_id = charge_id,
  source_module = 'finance',
  is_auto_generated = true,
  synced_at = COALESCE(updated_at, created_at, now())
WHERE charge_id IS NOT NULL AND source_type IS NULL;

UPDATE public.finance_transactions
SET
  source_type = 'payment_order',
  source_id = payment_order_id,
  source_module = 'finance',
  is_auto_generated = true,
  synced_at = COALESCE(updated_at, created_at, now())
WHERE payment_order_id IS NOT NULL AND source_type IS NULL;

-- Validation journalière DG
CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS cash_daily_validations_date_idx
  ON public.cash_daily_validations (date_validation DESC);

COMMENT ON COLUMN public.finance_transactions.source_type IS
  'worker_weekly_payment | subcontractor_payment | charge | payment_order | customer_invoice_payment | cash_funding';
