-- =============================================================================
-- CITYMO — Sync automatique feuille de caisse (source_type / source_id)
-- Coller dans Supabase → SQL Editor → Run
-- =============================================================================

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

CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS cash_daily_validations_date_idx
  ON public.cash_daily_validations (date_validation DESC);

-- Droits app (évite "row-level security policy" à la validation DG)
ALTER TABLE public.cash_daily_validations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'finance_sync_sources OK' AS status;
