-- Achats groupés : autoriser plusieurs dépenses projet par demande d'achat (une par OA)
-- À exécuter dans Supabase SQL Editor

DROP INDEX IF EXISTS public.idx_project_expenses_purchase_request_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_purchase_oa_unique
  ON public.project_expenses (purchase_acquisition_order_id)
  WHERE purchase_acquisition_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_purchase_request_simple_unique
  ON public.project_expenses (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL AND purchase_acquisition_order_id IS NULL;
