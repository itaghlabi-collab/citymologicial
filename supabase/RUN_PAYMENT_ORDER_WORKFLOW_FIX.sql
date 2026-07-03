-- CITYMO — Workflow OP payé → Charges / Dépenses par projet
-- Exécuter dans Supabase SQL Editor (une fois)
--
-- Prérequis (si pas déjà faits) :
--   • RUN_FINANCE_TRESORERIE.sql  → payment_orders, finance_charges, charge_id
--   • RUN_PURCHASE_WORKFLOW.sql   → liens achats ↔ OP
--   • RUN_PROJECT_EXPENSES.sql    → table project_expenses

-- Date réelle de paiement (utilisée quand statut = Payé)
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS date_paiement DATE;

-- Corriger les DA « Commande envoyée » sans envoi réel au fournisseur
UPDATE public.purchase_requests pr
SET statut = 'Ordre de paiement créé'
WHERE pr.statut = 'Commande envoyée'
  AND pr.acquisition_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.purchase_acquisition_orders oa
    WHERE oa.id = pr.acquisition_order_id
      AND oa.statut IS DISTINCT FROM 'Envoyé fournisseur'
  );

NOTIFY pgrst, 'reload schema';
