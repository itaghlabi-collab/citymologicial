-- Lignes de références par devis fournisseur (demande d'achat)
ALTER TABLE public.purchase_request_quotes
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;
