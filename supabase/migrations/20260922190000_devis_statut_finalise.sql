-- Autoriser statut finalise sur public.devis (Commercial / Devis en attente)

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis
  ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'realise', 'finalise', 'refuse'));
