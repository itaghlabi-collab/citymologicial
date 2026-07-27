-- CITYMO — Garder UNE seule demande Manœuvre Villa POLO, supprimer les doublons vides
-- À lancer SEULEMENT après avoir lu le résultat du diagnostic (QUERY_DIAG_DEMANDES_RH.sql)
-- Supabase → SQL Editor → Run
--
-- Règle : on garde la plus ANCIENNE demande Manœuvre POLO ;
-- on supprime les autres SEULEMENT si elles n’ont aucun ouvrier affecté.

WITH polo_manoeuvre AS (
  SELECT r.id, r.ref_demande, r.created_at,
         (SELECT count(*) FROM public.resource_request_workers w WHERE w.request_id = r.id) AS nb_aff
  FROM public.resource_requests r
  WHERE (r.project_name ILIKE '%polo%' OR r.project_ref ILIKE '%polo%'
         OR r.project_id IN (SELECT id FROM public.projects WHERE nom ILIKE '%polo%' OR ref ILIKE '%polo%'))
    AND (
      lower(coalesce(r.fonction, '')) LIKE '%manoeuv%'
      OR lower(coalesce(r.fonction, '')) LIKE '%manœuvre%'
      OR lower(coalesce(r.fonction, '')) LIKE '%manoeuvre%'
    )
    AND coalesce(r.request_type, 'ressource') = 'ressource'
    AND r.parent_request_id IS NULL
),
keeper AS (
  SELECT id FROM polo_manoeuvre
  ORDER BY CASE WHEN nb_aff > 0 THEN 0 ELSE 1 END, created_at ASC
  LIMIT 1
),
to_delete AS (
  SELECT pm.id, pm.ref_demande
  FROM polo_manoeuvre pm
  WHERE pm.id NOT IN (SELECT id FROM keeper)
    AND pm.nb_aff = 0
)
-- Aperçu avant delete (décommenter le DELETE après contrôle)
SELECT 'à supprimer' AS action, d.ref_demande, d.id
FROM to_delete d
UNION ALL
SELECT 'à garder', k.ref_demande, k.id
FROM polo_manoeuvre k
WHERE k.id IN (SELECT id FROM keeper);

-- Après contrôle, exécuter ce bloc :
/*
WITH polo_manoeuvre AS (
  SELECT r.id, r.created_at,
         (SELECT count(*) FROM public.resource_request_workers w WHERE w.request_id = r.id) AS nb_aff
  FROM public.resource_requests r
  WHERE (r.project_name ILIKE '%polo%' OR r.project_ref ILIKE '%polo%'
         OR r.project_id IN (SELECT id FROM public.projects WHERE nom ILIKE '%polo%' OR ref ILIKE '%polo%'))
    AND (
      lower(coalesce(r.fonction, '')) LIKE '%manoeuv%'
      OR lower(coalesce(r.fonction, '')) LIKE '%manœuvre%'
      OR lower(coalesce(r.fonction, '')) LIKE '%manoeuvre%'
    )
    AND coalesce(r.request_type, 'ressource') = 'ressource'
    AND r.parent_request_id IS NULL
),
keeper AS (
  SELECT id FROM polo_manoeuvre
  ORDER BY CASE WHEN nb_aff > 0 THEN 0 ELSE 1 END, created_at ASC
  LIMIT 1
),
to_delete AS (
  SELECT pm.id
  FROM polo_manoeuvre pm
  WHERE pm.id NOT IN (SELECT id FROM keeper)
    AND pm.nb_aff = 0
)
UPDATE public.project_staff_needs n
SET resource_request_id = NULL,
    statut = 'annule',
    updated_at = now()
WHERE n.resource_request_id IN (SELECT id FROM to_delete);

DELETE FROM public.resource_requests
WHERE id IN (SELECT id FROM to_delete);
*/
