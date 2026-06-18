-- =============================================================================
-- CITYMO — Nettoyage lignes caisse ouvriers (montants / doublons incorrects)
-- Exécuter dans Supabase SQL Editor puis Feuille de caisse → Actualiser
-- =============================================================================

-- 1) Lignes par semaine (source_id = id payroll) — ancien modèle
DELETE FROM public.finance_transactions ft
USING public.payroll p
WHERE ft.source_type IN ('worker_weekly_payment', 'worker_payment')
  AND ft.source_id = p.id::text
  AND ft.statut <> 'Annulé';

-- 2) Ancien type worker_payment
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_payment'
  AND statut <> 'Annulé';

-- 3) Lignes auto ouvrier consolidées (seront recréées par Actualiser)
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_weekly_payment'
  AND COALESCE(is_auto_generated, true) = true
  AND statut <> 'Annulé';

-- Après exécution : app → Feuille de caisse → Actualiser
-- Montants = Net à payer affiché dans Paiement hebdo (578,50 / 760,50 etc.)
