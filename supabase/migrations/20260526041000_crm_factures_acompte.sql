-- CRM Factures — colonnes facture d'acompte
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'facture';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS pourcentage_acompte NUMERIC(5, 2);
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'MAD';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devis_reste_apres NUMERIC(14, 2);

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_type_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_type_check
  CHECK (type IN ('facture', 'acompte'));

CREATE INDEX IF NOT EXISTS idx_crm_factures_type ON public.crm_factures(type);
CREATE INDEX IF NOT EXISTS idx_crm_factures_devis_acompte ON public.crm_factures(devis_id, type);
