-- Étape 5 Finance — origine Main d'œuvre sur project_expenses
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'project_expenses'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%origine%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.project_expenses DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE public.project_expenses
    ADD CONSTRAINT project_expenses_origine_check
    CHECK (origine IN (
      'import_excel',
      'achat',
      'ordre_paiement',
      'charge_manuelle',
      'main_oeuvre'
    ));
END $$;
