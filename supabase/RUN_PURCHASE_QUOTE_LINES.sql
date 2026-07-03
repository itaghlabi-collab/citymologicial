-- À exécuter dans Supabase SQL Editor si la colonne lines n'existe pas encore
ALTER TABLE public.purchase_request_quotes
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;
