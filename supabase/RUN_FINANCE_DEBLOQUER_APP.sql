-- =============================================================================
-- CITYMO — DÉBLOQUER l'app Finance (données visibles SQL Editor mais pas ERP)
-- Exécuter MAINTENANT dans Supabase → SQL Editor → Run
-- =============================================================================

-- 1) Désactiver RLS sur toutes les tables Finance
ALTER TABLE IF EXISTS public.finance_categories    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_charges       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_orders        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_transactions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_monthly_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;

-- 2) Droits lecture/écriture pour l'app
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_categories    TO anon, authenticated, service_role;
GRANT ALL ON public.finance_charges       TO anon, authenticated, service_role;
GRANT ALL ON public.payment_orders        TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions  TO anon, authenticated, service_role;
GRANT ALL ON public.cash_monthly_balances TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;

-- 3) Recharger le cache API Supabase
NOTIFY pgrst, 'reload schema';

-- 4) Contrôle
SELECT 'finance_categories' AS element, COUNT(*)::text AS valeur FROM public.finance_categories
UNION ALL SELECT 'finance_transactions', COUNT(*)::text FROM public.finance_transactions;

SELECT c.relname AS table_name,
       CASE WHEN c.relrowsecurity THEN 'RLS ON (bloque app)' ELSE 'RLS OFF (OK)' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('finance_categories','finance_transactions','cash_monthly_balances','cash_daily_validations')
ORDER BY 1;
