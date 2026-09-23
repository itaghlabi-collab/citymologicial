-- CITYMO — Clients CRM : unicité nom+prénom (pas nom seul)
-- Coller dans Supabase SQL Editor → Run
-- Permet « Amoudi Youssef » même si « AMOUDI » existe déjà

DROP INDEX IF EXISTS public.idx_clients_nom_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nom_prenom_unique
  ON public.clients (lower(trim(nom)), lower(trim(coalesce(prenom, ''))));
