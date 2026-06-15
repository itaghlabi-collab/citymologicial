-- =============================================================================
-- CITYMO — Audit sync RH → Feuille de caisse
-- Supabase → SQL Editor → Run
-- =============================================================================

-- 1) Colonnes sync présentes ?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'finance_transactions'
  AND column_name IN ('source_type', 'source_id', 'is_auto_generated', 'validation_status', 'synced_at')
ORDER BY column_name;

-- 2) Paiements ouvriers payés (table payroll)
SELECT
  'payroll_payes' AS controle,
  COUNT(*)::text AS valeur
FROM public.payroll
WHERE statut IN ('Paye', 'Payé');

SELECT id, worker_id, project_id, payment_date, montant_net, statut, semaine_debut, semaine_fin
FROM public.payroll
WHERE statut IN ('Paye', 'Payé')
ORDER BY payment_date DESC NULLS LAST, created_at DESC
LIMIT 20;

-- 3) Paiements sous-traitants (table subcontractor_payments)
SELECT
  'subcontractor_paid' AS controle,
  COUNT(*)::text AS valeur
FROM public.subcontractor_payments
WHERE status IN ('paid', 'Payé');

SELECT id, subcontractor_id, project_id, payment_date, amount, status
FROM public.subcontractor_payments
WHERE status IN ('paid', 'Payé')
ORDER BY payment_date DESC NULLS LAST, created_at DESC
LIMIT 20;

-- 4) Transactions auto-sync RH
SELECT
  source_type,
  COUNT(*)::text AS nb,
  COALESCE(SUM(montant), 0)::text AS total_mad
FROM public.finance_transactions
WHERE source_type IN ('worker_weekly_payment', 'subcontractor_payment')
  AND statut <> 'Annulé'
GROUP BY source_type;

-- 5) Paiements ouvriers SANS ligne caisse
SELECT p.id, p.payment_date, p.montant_net, p.statut, w.prenom, w.nom
FROM public.payroll p
LEFT JOIN public.workers w ON w.id = p.worker_id
LEFT JOIN public.finance_transactions t
  ON t.source_type = 'worker_weekly_payment' AND t.source_id = p.id AND t.statut <> 'Annulé'
WHERE p.statut IN ('Paye', 'Payé')
  AND COALESCE(p.montant_net, 0) > 0
  AND t.id IS NULL
ORDER BY p.payment_date DESC NULLS LAST
LIMIT 20;

-- 6) Paiements sous-traitants SANS ligne caisse
SELECT sp.id, sp.payment_date, sp.amount, sp.status, s.prenom, s.nom, s.raison_sociale
FROM public.subcontractor_payments sp
LEFT JOIN public.subcontractors s ON s.id = sp.subcontractor_id
LEFT JOIN public.finance_transactions t
  ON t.source_type = 'subcontractor_payment' AND t.source_id = sp.id AND t.statut <> 'Annulé'
WHERE sp.status IN ('paid', 'Payé')
  AND COALESCE(sp.amount, 0) > 0
  AND t.id IS NULL
ORDER BY sp.payment_date DESC NULLS LAST
LIMIT 20;

-- 7) RLS finance_transactions
SELECT c.relname,
       CASE WHEN c.relrowsecurity THEN 'RLS ON — peut bloquer' ELSE 'RLS OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('finance_transactions', 'cash_daily_validations', 'payroll', 'subcontractor_payments');
