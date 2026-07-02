-- Champs complémentaires archives CRM (devis lié, échéance)

ALTER TABLE public.crm_archives ADD COLUMN IF NOT EXISTS devis_reference TEXT;
ALTER TABLE public.crm_archives ADD COLUMN IF NOT EXISTS date_echeance DATE;

CREATE INDEX IF NOT EXISTS idx_crm_archives_devis_reference ON public.crm_archives(devis_reference);
