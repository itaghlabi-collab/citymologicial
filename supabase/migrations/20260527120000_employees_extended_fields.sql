-- RH Employés — champs étendus (adresse, CIN, CNSS, RIB, banque, situation familiale)
-- Exécuter dans Supabase → SQL Editor ou : supabase db push

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS adresse TEXT,
  ADD COLUMN IF NOT EXISTS numero_cin TEXT,
  ADD COLUMN IF NOT EXISTS cnss TEXT,
  ADD COLUMN IF NOT EXISTS rib TEXT,
  ADD COLUMN IF NOT EXISTS banque TEXT,
  ADD COLUMN IF NOT EXISTS situation_familiale TEXT;

COMMENT ON COLUMN public.employees.adresse IS 'Adresse postale';
COMMENT ON COLUMN public.employees.numero_cin IS 'Numéro CIN marocain';
COMMENT ON COLUMN public.employees.cnss IS 'Numéro CNSS';
COMMENT ON COLUMN public.employees.rib IS 'Relevé d''identité bancaire';
COMMENT ON COLUMN public.employees.banque IS 'Banque';
COMMENT ON COLUMN public.employees.situation_familiale IS 'Situation familiale (célibataire, marié, etc.)';

-- CIN unique si renseigné (évite doublons import)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_numero_cin_unique
  ON public.employees (numero_cin)
  WHERE numero_cin IS NOT NULL AND TRIM(numero_cin) <> '';

-- Recherche / filtre téléphone
CREATE INDEX IF NOT EXISTS idx_employees_telephone ON public.employees (telephone)
  WHERE telephone IS NOT NULL AND TRIM(telephone) <> '';
