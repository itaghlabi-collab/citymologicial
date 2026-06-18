-- Ajout statut « converti » pour devis CRM convertis en projet

ALTER TABLE public.crm_devis DROP CONSTRAINT IF EXISTS crm_devis_statut_check;
ALTER TABLE public.crm_devis
  ADD CONSTRAINT crm_devis_statut_check
  CHECK (statut IN ('brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente', 'converti'));
