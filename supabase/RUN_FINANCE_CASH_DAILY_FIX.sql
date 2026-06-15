-- =============================================================================
-- CITYMO — Corriger validation caisse du jour (erreur RLS)
-- Supabase → SQL Editor → Run
-- Erreur typique : "new row violates row-level security policy for table cash_daily_validations"
-- =============================================================================

ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'RLS ON — bloque l''app' ELSE 'RLS OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'cash_daily_validations';
