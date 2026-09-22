-- Devis en attente : titre + prospect libre (saisie manuelle)
-- Exécuter aussi via supabase/RUN_DEVIS_TITRE_PROSPECT_NOM.sql si besoin

ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS prospect_nom TEXT;
