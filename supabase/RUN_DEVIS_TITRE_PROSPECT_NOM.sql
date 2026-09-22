-- CITYMO — Devis en attente : titre + prospect libre
-- Coller dans Supabase SQL Editor puis Exécuter

ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS prospect_nom TEXT;
