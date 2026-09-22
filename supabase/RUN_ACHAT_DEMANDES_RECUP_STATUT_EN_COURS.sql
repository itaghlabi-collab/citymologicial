-- CITYMO — Demande récupération : statut en_cours (OP Initié)
-- Coller dans Supabase SQL Editor → Run

ALTER TABLE public.achat_demandes_recuperation DROP CONSTRAINT IF EXISTS achat_demandes_recuperation_statut_check;
ALTER TABLE public.achat_demandes_recuperation
  ADD CONSTRAINT achat_demandes_recuperation_statut_check
  CHECK (statut IN ('en_cours', 'prete_a_recuperer', 'recuperee', 'annulee'));
