-- =============================================================================
-- CITYMO — Paiements sous-traitants : type (mètre / tâche / service)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent
-- =============================================================================

ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS payment_type TEXT
  CHECK (payment_type IS NULL OR payment_type IN ('metre', 'tache', 'service'));
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.subcontractor_payments DROP CONSTRAINT IF EXISTS subcontractor_payments_status_check;
ALTER TABLE public.subcontractor_payments
  ADD CONSTRAINT subcontractor_payments_status_check
  CHECK (status IN ('paid', 'pending', 'partial', 'cancelled'));

NOTIFY pgrst, 'reload schema';
