-- =============================================================================
-- CITYMO — Corriger les droits RLS Finance (lecture vide dans l'app)
-- À exécuter si Supabase Table Editor affiche des données mais l'ERP reste vide
-- Projet attendu : https://npddbwsskaojcawaxygh.supabase.co
-- =============================================================================

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_categories',
    'finance_charges',
    'payment_orders',
    'finance_transactions',
    'cash_monthly_balances'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_all_auth ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_all_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t, t
      );
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      RAISE NOTICE 'RLS OK → %', t;
    ELSE
      RAISE NOTICE 'Table absente (ignorée) → %', t;
    END IF;
  END LOOP;
END $rls$;

-- Contrôle (SQL Editor = service_role, voit toutes les lignes)
SELECT 'finance_categories' AS table_name, COUNT(*) AS lignes FROM public.finance_categories
UNION ALL SELECT 'finance_charges', COUNT(*) FROM public.finance_charges
UNION ALL SELECT 'finance_transactions', COUNT(*) FROM public.finance_transactions
UNION ALL SELECT 'cash_monthly_balances', COUNT(*) FROM public.cash_monthly_balances
UNION ALL SELECT 'payment_orders', COUNT(*) FROM public.payment_orders;
