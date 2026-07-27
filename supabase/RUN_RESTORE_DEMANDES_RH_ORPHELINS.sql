-- CITYMO — Remettre les demandes RH manquantes (MEAD ONDA + tous orphelins)
-- Supabase → SQL Editor → coller TOUT → Run
-- Les besoins BR restent sur le projet ; ce script crée les DR manquantes.

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS staff_need_id UUID;
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS request_type TEXT;
UPDATE public.resource_requests SET request_type = 'ressource' WHERE request_type IS NULL;

-- Avant
SELECT 'AVANT orphelins' AS etape, count(*)::int AS n
FROM public.project_staff_needs
WHERE resource_request_id IS NULL
  AND statut IN ('soumis', 'en_recherche_rh');

DO $$
DECLARE
  v_need record;
  v_proj record;
  v_req_id uuid;
  v_ref text;
  v_fonction text;
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_actor_name text;
BEGIN
  FOR v_need IN
    SELECT n.*
    FROM public.project_staff_needs n
    WHERE n.resource_request_id IS NULL
      AND n.statut IN ('soumis', 'en_recherche_rh')
    ORDER BY n.created_at ASC
  LOOP
    SELECT id, ref, nom INTO v_proj
    FROM public.projects WHERE id = v_need.project_id;

    v_fonction := CASE
      WHEN coalesce(v_need.type_besoin, '') = 'Ouvriers'
        THEN coalesce(nullif(trim(v_need.corps_metier), ''), 'Ouvrier')
      ELSE coalesce(nullif(trim(v_need.type_besoin), ''), 'Ouvrier')
    END;

    SELECT coalesce(max(
      CASE
        WHEN ref_demande ~ ('^DR-' || v_year::text || '-[0-9]+$')
          THEN substring(ref_demande from '[0-9]+$')::int
        ELSE 0
      END
    ), 0) + 1
    INTO v_seq
    FROM public.resource_requests
    WHERE ref_demande LIKE 'DR-' || v_year::text || '-%';

    v_ref := 'DR-' || v_year::text || '-' || lpad(v_seq::text, 3, '0');
    v_actor_name := coalesce(nullif(trim(v_need.responsable_demande), ''), 'Réparation ERP');

    INSERT INTO public.resource_requests (
      ref_demande, project_id, project_ref, project_name,
      fonction, quantite, date_souhaitee, priorite, commentaire,
      staff_need_id, statut, requested_by_name,
      request_type, created_at, updated_at
    ) VALUES (
      v_ref,
      v_need.project_id,
      coalesce(v_proj.ref, ''),
      coalesce(v_proj.nom, ''),
      v_fonction,
      greatest(1, coalesce(v_need.quantite_necessaire, 1)::int),
      v_need.date_debut_souhaitee,
      coalesce(nullif(v_need.priorite, ''), 'Normale'),
      'Réparation auto — ' || coalesce(v_need.ref_besoin, v_need.id::text),
      v_need.id,
      'en_attente',
      v_actor_name,
      'ressource',
      now(),
      now()
    )
    RETURNING id INTO v_req_id;

    UPDATE public.project_staff_needs
    SET resource_request_id = v_req_id,
        statut = 'en_recherche_rh',
        updated_at = now()
    WHERE id = v_need.id;
  END LOOP;
END $$;

-- Après : MEAD ONDA / Nouaceur / Onda
SELECT
  n.ref_besoin,
  n.corps_metier,
  n.statut AS besoin_statut,
  r.ref_demande,
  r.statut AS demande_rh,
  coalesce(r.project_name, p.nom) AS projet
FROM public.project_staff_needs n
LEFT JOIN public.resource_requests r ON r.id = n.resource_request_id
LEFT JOIN public.projects p ON p.id = n.project_id
WHERE coalesce(p.nom, r.project_name, '') ILIKE '%onda%'
   OR coalesce(p.ref, r.project_ref, '') ILIKE '%nouaceur%'
   OR coalesce(p.nom, '') ILIKE '%nouaceur%'
ORDER BY n.created_at;

SELECT 'APRES orphelins' AS etape, count(*)::int AS n
FROM public.project_staff_needs
WHERE resource_request_id IS NULL
  AND statut IN ('soumis', 'en_recherche_rh');
