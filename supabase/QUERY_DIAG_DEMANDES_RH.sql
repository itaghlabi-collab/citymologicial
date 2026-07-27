-- CITYMO — Diagnostic anciennes Demandes RH + nettoyage doublons Villa POLO
-- Supabase → SQL Editor → Run
-- Répond à : où sont les anciennes DR ? pourquoi doublon Manœuvre POLO ?

-- ═══════════════════════════════════════════════════════════════════════════
-- A) Toutes les demandes RH encore en base (aperçu)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  ref_demande,
  project_name,
  project_ref,
  fonction,
  quantite,
  statut,
  request_type,
  parent_request_id IS NOT NULL AS est_enfant_recrutement,
  staff_need_id,
  requested_by_name,
  created_at
FROM public.resource_requests
ORDER BY created_at DESC
LIMIT 100;

SELECT statut, request_type, count(*)::int AS n
FROM public.resource_requests
GROUP BY statut, request_type
ORDER BY n DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- B) Demandes AVEC ouvriers affectés (anciennes prises en charge RH)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  r.ref_demande,
  r.project_name,
  r.fonction,
  r.statut,
  r.quantite,
  count(w.id)::int AS nb_ouvriers_affectes,
  r.created_at
FROM public.resource_requests r
JOIN public.resource_request_workers w ON w.request_id = r.id
GROUP BY r.id
ORDER BY r.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- C) Villa POLO — besoins + demandes (voir les doublons Manœuvre)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  n.ref_besoin,
  n.corps_metier,
  n.quantite_necessaire,
  n.statut AS besoin_statut,
  r.ref_demande,
  r.statut AS demande_statut,
  (SELECT count(*) FROM public.resource_request_workers w WHERE w.request_id = r.id) AS affectes,
  n.created_at AS besoin_cree,
  r.created_at AS demande_cree
FROM public.project_staff_needs n
LEFT JOIN public.resource_requests r ON r.id = n.resource_request_id
WHERE n.project_id IN (
  SELECT id FROM public.projects
  WHERE nom ILIKE '%polo%' OR ref ILIKE '%polo%'
)
ORDER BY n.corps_metier, n.created_at;

-- Doublons Manœuvre POLO uniquement
SELECT r.ref_demande, r.fonction, r.quantite, r.statut, r.commentaire, r.created_at, r.id
FROM public.resource_requests r
WHERE (r.project_name ILIKE '%polo%' OR r.project_ref ILIKE '%polo%')
  AND (
    lower(coalesce(r.fonction, '')) LIKE '%manoeuv%'
    OR lower(coalesce(r.fonction, '')) LIKE '%manœuvre%'
  )
ORDER BY r.created_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Historique actions (preuves d’anciennes demandes / suppressions)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  h.created_at,
  r.ref_demande,
  r.project_name,
  h.action,
  h.details,
  h.actor_name
FROM public.resource_request_history h
LEFT JOIN public.resource_requests r ON r.id = h.request_id
ORDER BY h.created_at DESC
LIMIT 80;

-- ═══════════════════════════════════════════════════════════════════════════
-- E) Y a-t-il d’anciens statuts hors workflow actuel ?
--    (analyse / verifie n’existent PAS dans le modèle RH actuel)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT DISTINCT statut
FROM public.resource_requests
ORDER BY 1;

SELECT DISTINCT statut
FROM public.project_staff_needs
ORDER BY 1;
