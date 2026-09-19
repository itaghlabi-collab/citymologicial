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

-- 3) Annuler les dépenses générales jumelles
--    (même jour / libellé / montant / projet / mode — le fournisseur est souvent vide)
WITH charge_dups AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        date_charge,
        round(montant, 2),
        lower(trim(coalesce(libelle, ''))),
        lower(trim(coalesce(projet_lie, ''))),
        lower(trim(coalesce(mode_paiement, '')))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.finance_charges
  WHERE coalesce(statut, '') <> 'Annulé'
)
UPDATE public.finance_charges c
SET statut = 'Annulé',
    updated_at = NOW()
FROM charge_dups d
WHERE c.id = d.id
  AND d.rn > 1;

-- 3b) Même référence CHG attribuée deux fois
WITH same_ref AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY nullif(trim(ref_charge), '')
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.finance_charges
  WHERE coalesce(statut, '') <> 'Annulé'
    AND nullif(trim(ref_charge), '') IS NOT NULL
)
UPDATE public.finance_charges c
SET statut = 'Annulé',
    updated_at = NOW()
FROM same_ref s
WHERE c.id = s.id
  AND s.rn > 1;

-- 3c) Annuler les lignes caisse liées aux dépenses désormais annulées
UPDATE public.finance_transactions t
SET statut = 'Annulé',
    validation_status = 'cancelled',
    synced_at = NOW()
WHERE t.source_type = 'charge'
  AND t.source_id IN (
    SELECT id FROM public.finance_charges WHERE statut = 'Annulé'
  )
  AND coalesce(t.statut, '') <> 'Annulé';

-- 4) Ligne caisse manquante pour les Espèces actives (ex. MOHAMED RAHHOU)
INSERT INTO public.finance_transactions (
  date_operation, sens, type_operation, contrepartie, description, montant,
  mode_paiement, category_id, project_id, charge_id,
  source_type, source_id, source_module, is_auto_generated,
  validation_status, statut, created_by
)
SELECT
  c.date_charge,
  'sortie',
  'charge',
  c.fournisseur,
  c.libelle,
  c.montant,
  coalesce(nullif(trim(c.mode_paiement), ''), 'Espèces'),
  c.category_id,
  c.project_id,
  c.id,
  'charge',
  c.id,
  'finance',
  true,
  'pending',
  'Validé',
  c.created_by
FROM public.finance_charges c
WHERE coalesce(c.statut, '') <> 'Annulé'
  AND regexp_replace(
        lower(translate(coalesce(c.mode_paiement, ''), 'ÉéÈèÊêËë', 'Eeeeeeee')),
        '[\s_-]+', '', 'g'
      ) IN ('espece', 'especes', 'cash')
  AND NOT EXISTS (
    SELECT 1
    FROM public.finance_transactions t
    WHERE t.source_type = 'charge'
      AND t.source_id = c.id
      AND coalesce(t.statut, '') <> 'Annulé'
  );

-- Contrôle dépenses courantes 19/09 (1 AFALAH, 1 AIDE MEDICALE, 1 RAHHOU)
SELECT date_charge, libelle, montant, mode_paiement, count(*) AS lignes
FROM public.finance_charges
WHERE date_charge = '2026-09-19'
  AND coalesce(statut, '') <> 'Annulé'
GROUP BY 1, 2, 3, 4
ORDER BY count(*) DESC, libelle;

-- Contrôle caisse charge 19/09
SELECT date_operation, contrepartie, description, montant, mode_paiement, count(*) AS lignes
FROM public.finance_transactions
WHERE source_type = 'charge'
  AND date_operation = '2026-09-19'
  AND coalesce(statut, '') <> 'Annulé'
GROUP BY 1, 2, 3, 4, 5
ORDER BY count(*) DESC, description;
