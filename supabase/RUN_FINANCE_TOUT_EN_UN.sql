-- =============================================================================
-- CITYMO — FINANCE : script UNIQUE (tout ce qui manquait)
-- Supabase → SQL Editor → New query → Run
-- Ré-exécutable sans danger (IF NOT EXISTS / IF EXISTS)
-- =============================================================================

-- ── A) Colonnes sync auto sur finance_transactions ───────────────────────────
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

-- Rétro-compat : anciennes lignes charges / ordres déjà liées
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

-- ── B) Validation journalière DG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS cash_daily_validations_date_idx
  ON public.cash_daily_validations (date_validation DESC);

-- ── C) Désactiver RLS Finance (sinon app bloquée / sync impossible) ──────────
ALTER TABLE IF EXISTS public.finance_categories     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_charges        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_orders         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_monthly_balances  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;

-- ── D) Droits lecture/écriture app ───────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_categories     TO anon, authenticated, service_role;
GRANT ALL ON public.finance_charges        TO anon, authenticated, service_role;
GRANT ALL ON public.payment_orders         TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions   TO anon, authenticated, service_role;
GRANT ALL ON public.cash_monthly_balances  TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;

-- ── E) Catégorie Sous-traitance (cockpit + sync sous-traitants) ───────────────
INSERT INTO public.finance_categories (nom, description, statut)
SELECT 'Sous-traitance', 'Paiements sous-traitants', 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories
  WHERE lower(trim(nom)) IN ('sous-traitance', 'sous traitance')
);

NOTIFY pgrst, 'reload schema';

-- ── F) Contrôle final ────────────────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'finance_transactions'
  AND column_name IN ('source_type', 'source_id', 'is_auto_generated')
ORDER BY column_name;

SELECT c.relname AS table_name,
       CASE WHEN c.relrowsecurity THEN 'RLS ON — BLOQUE' ELSE 'RLS OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'finance_transactions', 'cash_daily_validations',
    'finance_charges', 'cash_monthly_balances'
  )
ORDER BY 1;

SELECT 'finance_tout_en_un OK — Feuille de caisse → Actualiser' AS status;
