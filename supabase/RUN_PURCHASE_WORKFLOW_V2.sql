-- CITYMO — Workflow Achats V2 (compléments)
-- Exécuter après RUN_PURCHASE_WORKFLOW.sql

ALTER TABLE public.purchase_request_quotes
  ADD COLUMN IF NOT EXISTS ref_devis_fournisseur TEXT;

ALTER TABLE public.purchase_request_history
  ADD COLUMN IF NOT EXISTS commentaire TEXT;

ALTER TABLE public.purchase_acquisition_orders
  ADD COLUMN IF NOT EXISTS purchase_request_ref TEXT;

ALTER TABLE public.purchase_acquisition_orders
  ADD COLUMN IF NOT EXISTS responsable_achats TEXT;

ALTER TABLE public.purchase_acquisition_orders
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS montant_ht NUMERIC(14,2);

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,2);

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purchase_request_ref TEXT;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purchase_oa_ref TEXT;

NOTIFY pgrst, 'reload schema';
