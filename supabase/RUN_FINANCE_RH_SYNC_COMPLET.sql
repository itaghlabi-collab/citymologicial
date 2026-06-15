-- =============================================================================
-- CITYMO — Sync RH → Feuille de caisse (script complet à exécuter UNE FOIS)
-- Supabase → SQL Editor → Run
-- =============================================================================

-- 1) Colonnes sync sur finance_transactions
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

-- 2) Validation journalière DG
CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS cash_daily_validations_date_idx
  ON public.cash_daily_validations (date_validation DESC);

-- 3) Désactiver RLS + droits (obligatoire pour l'app)
ALTER TABLE public.finance_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_daily_validations DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'finance_rh_sync_complet OK — retournez dans Feuille de caisse → Actualiser' AS status;
