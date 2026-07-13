-- Suppression ciblée : dépense test CHG-2026-968 (11/07/2026, 10,96 MAD, libellé "test")
-- Ne touche rien d'autre : vérifie ref + montant + libellé + date avant DELETE.

BEGIN;

DO $$
DECLARE
  v_id UUID;
  v_ref TEXT;
  v_libelle TEXT;
  v_montant NUMERIC;
  v_date DATE;
BEGIN
  SELECT id, ref_charge, libelle, montant, date_charge
  INTO v_id, v_ref, v_libelle, v_montant, v_date
  FROM public.finance_charges
  WHERE ref_charge = 'CHG-2026-968'
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'Aucune charge CHG-2026-968 trouvée — rien à supprimer.';
    RETURN;
  END IF;

  IF lower(trim(coalesce(v_libelle, ''))) <> 'test'
     OR abs(coalesce(v_montant, 0) - 10.96) > 0.01
     OR v_date::date <> DATE '2026-07-11' THEN
    RAISE EXCEPTION 'Charge CHG-2026-968 ne correspond pas au test attendu (libellé=test, 10,96 MAD, 2026-07-11). Abandon.';
  END IF;

  DELETE FROM public.project_expenses
  WHERE source_type = 'finance_charge' AND source_id = v_id;

  DELETE FROM public.finance_transactions
  WHERE charge_id = v_id
     OR (source_type = 'charge' AND source_id = v_id);

  DELETE FROM public.finance_charges
  WHERE id = v_id;

  RAISE NOTICE 'Charge test supprimée : % (%, % MAD, %)', v_ref, v_libelle, v_montant, v_date;
END $$;

COMMIT;
