-- CITYMO — Annuler les doublons caisse nés des clics répétés « Ajouter dépense ».
-- N'efface rien : passe les copies en statut Annulé (hors calcul feuille).
-- Ne touche pas aux alimentations caisse ni aux lignes uniques (ex. AIDE MEDICALE).
-- À exécuter dans Supabase SQL Editor.

-- 1) Plusieurs écritures pour la MÊME dépense (source_type + source_id)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY source_type, source_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.finance_transactions
  WHERE source_type = 'charge'
    AND source_id IS NOT NULL
    AND coalesce(statut, '') <> 'Annulé'
)
UPDATE public.finance_transactions t
SET statut = 'Annulé',
    validation_status = 'cancelled',
    synced_at = NOW()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 2) Copies accidentelles (même date / montant / libellé / fournisseur / mode)
--    créées dans la même heure — cas AFALAH NABIL 300 MAD du 19/09/2026.
WITH clustered AS (
  SELECT
    id,
    source_id,
    charge_id,
    row_number() OVER (
      PARTITION BY
        date_operation,
        round(montant, 2),
        lower(trim(coalesce(description, ''))),
        lower(trim(coalesce(contrepartie, ''))),
        lower(trim(coalesce(mode_paiement, '')))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn,
    first_value(created_at) OVER (
      PARTITION BY
        date_operation,
        round(montant, 2),
        lower(trim(coalesce(description, ''))),
        lower(trim(coalesce(contrepartie, ''))),
        lower(trim(coalesce(mode_paiement, '')))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS first_at,
    created_at
  FROM public.finance_transactions
  WHERE source_type = 'charge'
    AND coalesce(statut, '') <> 'Annulé'
)
UPDATE public.finance_transactions t
SET statut = 'Annulé',
    validation_status = 'cancelled',
    synced_at = NOW()
FROM clustered c
WHERE t.id = c.id
  AND c.rn > 1
  AND c.created_at IS NOT NULL
  AND c.first_at IS NOT NULL
  AND c.created_at - c.first_at <= interval '1 hour';

-- 3) Annuler les dépenses générales jumelles (pas la première de chaque groupe)
WITH charge_dups AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        date_charge,
        round(montant, 2),
        lower(trim(coalesce(libelle, ''))),
        lower(trim(coalesce(fournisseur, ''))),
        created_by
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn,
    first_value(created_at) OVER (
      PARTITION BY
        date_charge,
        round(montant, 2),
        lower(trim(coalesce(libelle, ''))),
        lower(trim(coalesce(fournisseur, ''))),
        created_by
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS first_at,
    created_at
  FROM public.finance_charges
  WHERE coalesce(statut, '') <> 'Annulé'
)
UPDATE public.finance_charges c
SET statut = 'Annulé',
    updated_at = NOW()
FROM charge_dups d
WHERE c.id = d.id
  AND d.rn > 1
  AND d.created_at IS NOT NULL
  AND d.first_at IS NOT NULL
  AND d.created_at - d.first_at <= interval '1 hour';

-- Contrôle : lignes charge encore actives le 19/09 (attendre 1 AFALAH + 1 AIDE MEDICALE, etc.)
SELECT date_operation, contrepartie, description, montant, mode_paiement, count(*) AS lignes
FROM public.finance_transactions
WHERE source_type = 'charge'
  AND date_operation = '2026-09-19'
  AND coalesce(statut, '') <> 'Annulé'
GROUP BY 1, 2, 3, 4, 5
ORDER BY count(*) DESC, description;
