-- CITYMO — Devis commercial : autoriser statut « finalise »
-- Coller dans Supabase SQL Editor → Run

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis
  ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'realise', 'finalise', 'refuse'));
