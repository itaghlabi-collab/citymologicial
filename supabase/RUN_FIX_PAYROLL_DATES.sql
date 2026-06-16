-- =============================================================================
-- CITYMO — Corriger dates paiement ouvriers (évite plusieurs lignes même jour)
-- Supabase → SQL Editor → Run puis Feuille de caisse → Actualiser
-- =============================================================================

-- 1) payroll : date paiement = fin de semaine travaillée (si batch-payé le même jour)
UPDATE public.payroll
SET payment_date = semaine_fin
WHERE statut IN ('Paye', 'Payé')
  AND semaine_fin IS NOT NULL
  AND (payment_date IS NULL OR payment_date > semaine_fin);

-- 2) Resynchroniser date_operation dans finance_transactions
UPDATE public.finance_transactions t
SET
  date_operation = COALESCE(p.payment_date, p.semaine_fin, p.semaine_debut),
  synced_at = now()
FROM public.payroll p
WHERE t.source_type = 'worker_weekly_payment'
  AND t.source_id = p.id
  AND p.statut IN ('Paye', 'Payé')
  AND t.date_operation IS DISTINCT FROM COALESCE(p.payment_date, p.semaine_fin, p.semaine_debut);

SELECT
  w.prenom || ' ' || w.nom AS ouvrier,
  p.semaine_debut,
  p.semaine_fin,
  p.payment_date,
  t.date_operation,
  t.montant
FROM public.finance_transactions t
JOIN public.payroll p ON p.id = t.source_id
LEFT JOIN public.workers w ON w.id = p.worker_id
WHERE t.source_type = 'worker_weekly_payment'
  AND t.statut <> 'Annulé'
ORDER BY t.date_operation DESC, w.nom
LIMIT 30;

SELECT 'FIX_PAYROLL_DATES OK' AS status;
