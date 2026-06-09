-- =============================================================================
-- Vérification Finance — pourquoi l'app est vide alors que SQL Editor affiche des lignes
-- Exécuter dans Supabase → SQL Editor
-- =============================================================================

-- 1) Combien de lignes (rôle postgres = ce que vous voyez dans Table Editor)
SELECT 'finance_categories' AS tbl, COUNT(*)::int AS lignes_postgres FROM public.finance_categories
UNION ALL SELECT 'finance_transactions (EX-JUIN24)', COUNT(*)::int FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN24%'
UNION ALL SELECT 'finance_transactions (EX-JUIN26)', COUNT(*)::int FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN26%'
UNION ALL SELECT 'cash_monthly_balances 2024-06', COUNT(*)::int FROM public.cash_monthly_balances WHERE annee = 2024 AND mois = 6
UNION ALL SELECT 'cash_monthly_balances 2026-06', COUNT(*)::int FROM public.cash_monthly_balances WHERE annee = 2026 AND mois = 6;

-- 2) RLS activé ?
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('finance_categories','finance_transactions','cash_monthly_balances')
ORDER BY 1;

-- 3) Policies existantes
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('finance_categories','finance_transactions','cash_monthly_balances')
ORDER BY tablename, policyname;

-- 4) Liste catégories
SELECT nom, statut FROM public.finance_categories ORDER BY nom;
