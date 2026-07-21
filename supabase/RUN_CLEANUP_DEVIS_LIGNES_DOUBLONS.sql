-- Nettoyage optionnel des doublons déjà créés (titres/articles répétés).
-- À exécuter APRÈS RUN_FIX_DEVIS_LIGNES_DELETE_FOR_MODIFIER.sql
-- Stratégie : pour chaque devis, on garde une seule occurrence par empreinte de ligne
-- (type + désignation + description + qté + PU + TVA + remise), la plus ancienne (min id).

WITH ranked AS (
  SELECT
    id,
    devis_id,
    ROW_NUMBER() OVER (
      PARTITION BY
        devis_id,
        type,
        COALESCE(designation, ''),
        COALESCE(description, ''),
        COALESCE(quantite, 0),
        COALESCE(prix_ht, 0),
        COALESCE(remise, 0),
        COALESCE(tva, 0),
        COALESCE(article_id::text, ''),
        COALESCE(categorie_id::text, '')
      ORDER BY ordre ASC, created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.crm_devis_lignes
)
DELETE FROM public.crm_devis_lignes l
USING ranked r
WHERE l.id = r.id
  AND r.rn > 1;

-- Recalcule ordre 0..n-1 par devis
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY devis_id ORDER BY ordre ASC, id ASC) - 1 AS new_ordre
  FROM public.crm_devis_lignes
)
UPDATE public.crm_devis_lignes l
SET ordre = o.new_ordre
FROM ordered o
WHERE l.id = o.id;

SELECT 'doublons crm_devis_lignes nettoyés + ordre recalculé' AS status;
