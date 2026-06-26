-- Nettoyage données TEST — besoins projet + demandes RH
-- Cible : projet « AMENAGMENT TEST A » (et variantes orthographe)
-- À exécuter une fois dans Supabase → SQL Editor

BEGIN;

-- 1) Recrutements enfants liés au projet test
DELETE FROM public.resource_requests
WHERE parent_request_id IN (
  SELECT rr.id
  FROM public.resource_requests rr
  JOIN public.projects p ON p.id = rr.project_id
  WHERE p.nom ILIKE '%AMENAGMENT TEST A%'
     OR p.nom ILIKE '%AMENAGEMENT TEST A%'
);

-- 2) Demandes RH du projet test (workers + historique en cascade)
DELETE FROM public.resource_requests rr
USING public.projects p
WHERE rr.project_id = p.id
  AND (p.nom ILIKE '%AMENAGMENT TEST A%' OR p.nom ILIKE '%AMENAGEMENT TEST A%');

-- 3) Historique besoins
DELETE FROM public.project_staff_need_history h
USING public.project_staff_needs n
JOIN public.projects p ON p.id = n.project_id
WHERE h.need_id = n.id
  AND (p.nom ILIKE '%AMENAGMENT TEST A%' OR p.nom ILIKE '%AMENAGEMENT TEST A%');

-- 4) Besoins projet
DELETE FROM public.project_staff_needs n
USING public.projects p
WHERE n.project_id = p.id
  AND (p.nom ILIKE '%AMENAGMENT TEST A%' OR p.nom ILIKE '%AMENAGEMENT TEST A%');

COMMIT;
