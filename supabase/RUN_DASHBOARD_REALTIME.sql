-- =============================================================================
-- CITYMO — Activer Supabase Realtime pour le tableau de bord
-- Supabase → SQL Editor → Run (ré-exécutable)
--
-- Sans ce script : le dashboard fonctionne quand même via polling 30s.
-- Avec ce script : mise à jour quasi instantanée quand une donnée change.
-- =============================================================================

DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'finance_transactions',
    'cash_monthly_balances',
    'finance_charges',
    'payment_orders',
    'crm_factures',
    'crm_devis',
    'clients',
    'payroll',
    'subcontractor_payments',
    'projects',
    'internal_tasks',
    'internal_appointments',
    'leaves',
    'stock_articles',
    'stock_movements',
    'notifications',
    'attendance',
    'purchase_orders',
    'daily_cash_reviews',
    'prospects'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime absente — activez Realtime dans Supabase Dashboard (Database → Replication).';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Table public.% ignorée (absente)', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Realtime activé : public.%', t;
    ELSE
      RAISE NOTICE 'Déjà actif : public.%', t;
    END IF;
  END LOOP;
END
$do$;

-- Optionnel (comme notifications) — utile si vous filtrez par ligne plus tard
ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
ORDER BY tablename;
