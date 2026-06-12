-- =============================================================================
-- CITYMO — Paiements sous-traitants : type (mètre / tâche / service)
-- Supabase SQL Editor → coller tout → Run
-- Idempotent
--
-- PRÉREQUIS : RUN_SUBCONTRACTORS.sql (table public.subcontractor_payments)
-- =============================================================================

ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS payment_type TEXT;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.subcontractor_payments ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.subcontractor_payments DROP CONSTRAINT IF EXISTS subcontractor_payments_payment_type_check;
ALTER TABLE public.subcontractor_payments
  ADD CONSTRAINT subcontractor_payments_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('metre', 'tache', 'service'));

ALTER TABLE public.subcontractor_payments DROP CONSTRAINT IF EXISTS subcontractor_payments_status_check;
ALTER TABLE public.subcontractor_payments
  ADD CONSTRAINT subcontractor_payments_status_check
  CHECK (status IN ('paid', 'pending', 'partial', 'cancelled'));

NOTIFY pgrst, 'reload schema';

-- ─── Vérification (résultat attendu : 5 lignes « OK ») ───────────────────────
SELECT
  expected.column_name,
  CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM (VALUES
  ('payment_type'), ('designation'), ('quantity'), ('unit'), ('unit_price')
) AS expected(column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'subcontractor_payments'
 AND c.column_name = expected.column_name
ORDER BY expected.column_name;
