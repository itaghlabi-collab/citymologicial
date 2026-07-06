-- Exécuter dans Supabase SQL Editor
-- Répare les montants HT / TVA des archives importées quand seul le TTC est correct
-- (ex. HT = 0 ou 1 MAD alors que TTC = 78 506,40 MAD)

UPDATE public.crm_archives
SET
  total_ht = ROUND((total_ttc / 1.2)::numeric, 2),
  total_tva = ROUND((total_ttc - (total_ttc / 1.2))::numeric, 2),
  updated_at = now()
WHERE statut = 'importe'
  AND total_ttc > 0
  AND (
    total_ht IS NULL OR total_ht <= 0
    OR total_tva IS NULL OR total_tva <= 0
    OR (total_ht > 0 AND total_ht < total_ttc * 0.1)
  );

-- Vérification
SELECT
  reference,
  doc_type,
  total_ht,
  total_tva,
  total_ttc,
  statut
FROM public.crm_archives
WHERE statut = 'importe'
ORDER BY date_document DESC NULLS LAST, reference;
