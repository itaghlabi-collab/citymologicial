-- CITYMO — Colonnes fiche employé (date naissance, contrat, contact urgence)
-- À coller dans Supabase → SQL Editor → Run

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS date_naissance DATE,
  ADD COLUMN IF NOT EXISTS type_contrat TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence TEXT;

COMMENT ON COLUMN public.employees.date_naissance IS 'Date de naissance';
COMMENT ON COLUMN public.employees.type_contrat IS 'Type de contrat (CDI, CDD, etc.)';
COMMENT ON COLUMN public.employees.contact_urgence IS 'Contact d''urgence (nom + téléphone)';

SELECT 'Colonnes employés complémentaires OK' AS status;
