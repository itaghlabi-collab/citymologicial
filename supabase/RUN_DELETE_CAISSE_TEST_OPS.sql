-- CITYMO — Supprimer opérations caisse de test / à corriger
-- Exécuter dans Supabase → SQL Editor
-- 1) Juin 2026 : « depense test » 11 111 MAD (sortie)
-- 2) Septembre 2026 : Alimentation caisse 5 000 MAD (entrée)

BEGIN;

-- Aperçu avant suppression
SELECT id, date_operation, sens, type_operation, description, montant, source_type, is_auto_generated
FROM public.finance_transactions
WHERE
  (
    date_operation = '2026-06-25'
    AND montant = 11111
    AND description ILIKE '%depense test%'
  )
  OR (
    date_operation = '2026-09-04'
    AND montant = 5000
    AND (
      type_operation = 'alimentation_caisse'
      OR source_type = 'cash_funding'
      OR description ILIKE '%Alimentation caisse%'
    )
  )
ORDER BY date_operation, montant;

DELETE FROM public.finance_transactions
WHERE
  (
    date_operation = '2026-06-25'
    AND montant = 11111
    AND description ILIKE '%depense test%'
  )
  OR (
    date_operation = '2026-09-04'
    AND montant = 5000
    AND (
      type_operation = 'alimentation_caisse'
      OR source_type = 'cash_funding'
      OR description ILIKE '%Alimentation caisse%'
    )
  );

COMMIT;

-- Les totaux Feuille de caisse se recalculent automatiquement
-- (solde = solde_initial + alimentation + entrées − sorties).
