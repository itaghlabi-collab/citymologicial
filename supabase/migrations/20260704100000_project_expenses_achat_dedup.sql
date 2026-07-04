-- Dépenses par projet — une seule ligne par demande d'achat (origine = achat)
ALTER TABLE public.project_expenses
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_acquisition_order_id UUID REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS montant_paye NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS date_paiement DATE;

ALTER TABLE public.project_expenses DROP CONSTRAINT IF EXISTS project_expenses_statut_check;
ALTER TABLE public.project_expenses ADD CONSTRAINT project_expenses_statut_check
  CHECK (statut IN ('valide', 'annule', 'en_attente', 'engagee', 'payee'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_purchase_request_unique
  ON public.project_expenses (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_expenses_purchase_oa
  ON public.project_expenses (purchase_acquisition_order_id)
  WHERE purchase_acquisition_order_id IS NOT NULL;
