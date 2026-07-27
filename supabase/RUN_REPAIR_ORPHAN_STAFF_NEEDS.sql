-- CITYMO — Réparer besoins RH orphelins + transmission sécurisée vers Demandes ressources
-- Supabase → SQL Editor → Run une fois
--
-- Problème : project_staff_needs en "soumis" / "En attente RH" sans resource_request_id
-- → n'apparaissent PAS dans RH → Demandes ressources (table resource_requests).
-- Cause : insert besoin OK, puis insert resource_requests échoue (souvent RLS module).

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS staff_need_id UUID;
ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS request_type TEXT;
UPDATE public.resource_requests SET request_type = 'ressource' WHERE request_type IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) RPC : transmission besoin → demande RH (bypass RLS module)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_staff_need_to_rh(p_need_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_need public.project_staff_needs%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_req_id uuid;
  v_ref text;
  v_fonction text;
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Session requise';
  END IF;

  SELECT * INTO v_need FROM public.project_staff_needs WHERE id = p_need_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Besoin introuvable';
  END IF;

  IF v_need.resource_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_need.resource_request_id,
      'ref_demande', (SELECT ref_demande FROM public.resource_requests WHERE id = v_need.resource_request_id),
      'already_linked', true
    );
  END IF;

  SELECT * INTO v_proj FROM public.projects WHERE id = v_need.project_id;

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

  SELECT coalesce(nullif(trim(p.nom), ''), split_part(coalesce(p.email, ''), '@', 1), 'Utilisateur')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.resource_requests (
    ref_demande, project_id, project_ref, project_name,
    fonction, quantite, date_souhaitee, priorite, commentaire,
    staff_need_id, statut, requested_by, requested_by_name,
    request_type, created_at, updated_at
  ) VALUES (
    v_ref,
    v_need.project_id,
    coalesce(v_proj.ref, ''),
    coalesce(v_proj.nom, ''),
    v_fonction,
    greatest(1, coalesce(v_need.quantite_necessaire, 1)),
    v_need.date_debut_souhaitee,
    coalesce(nullif(v_need.priorite, ''), 'Normale'),
    nullif(trim(concat_ws(E'\n',
      v_need.description_travaux,
      CASE WHEN v_need.competences IS NOT NULL AND v_need.competences <> '' THEN 'Compétences : ' || v_need.competences END,
      CASE WHEN v_need.epi_obligatoires IS NOT NULL AND v_need.epi_obligatoires <> '' THEN 'EPI : ' || v_need.epi_obligatoires END,
      v_need.observation
    )), ''),
    v_need.id,
    'en_attente',
    auth.uid(),
    coalesce(v_actor_name, 'Utilisateur'),
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

  BEGIN
    INSERT INTO public.resource_request_history (request_id, action, details, actor_id, actor_name)
    VALUES (v_req_id, 'created', 'Demande créée depuis besoin ' || coalesce(v_need.ref_besoin, v_need.id::text), auth.uid(), v_actor_name);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- historique non bloquant
  END;

  RETURN jsonb_build_object(
    'id', v_req_id,
    'ref_demande', v_ref,
    'already_linked', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_staff_need_to_rh(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_staff_need_to_rh(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Réparer TOUS les orphelins actuels (soumis sans demande RH)
--    (SQL Editor = rôle postgres, pas d’auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_need public.project_staff_needs%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_req_id uuid;
  v_ref text;
  v_fonction text;
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_actor uuid;
  v_actor_name text;
BEGIN
  FOR v_need IN
    SELECT *
    FROM public.project_staff_needs
    WHERE resource_request_id IS NULL
      AND statut IN ('soumis', 'en_recherche_rh')
    ORDER BY created_at ASC
  LOOP
    SELECT * INTO v_proj FROM public.projects WHERE id = v_need.project_id;

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
    v_actor := v_need.created_by;
    SELECT coalesce(nullif(trim(p.nom), ''), 'Réparation ERP')
    INTO v_actor_name
    FROM public.profiles p WHERE p.id = v_actor;
    v_actor_name := coalesce(v_actor_name, 'Réparation ERP');

    INSERT INTO public.resource_requests (
      ref_demande, project_id, project_ref, project_name,
      fonction, quantite, date_souhaitee, priorite, commentaire,
      staff_need_id, statut, requested_by, requested_by_name,
      request_type, created_at, updated_at
    ) VALUES (
      v_ref,
      v_need.project_id,
      coalesce(v_proj.ref, ''),
      coalesce(v_proj.nom, ''),
      v_fonction,
      greatest(1, coalesce(v_need.quantite_necessaire, 1)),
      v_need.date_debut_souhaitee,
      coalesce(nullif(v_need.priorite, ''), 'Normale'),
      'Réparation auto — besoin orphelin ' || coalesce(v_need.ref_besoin, v_need.id::text),
      v_need.id,
      'en_attente',
      v_actor,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Contrôle : orphelins restants + demandes Villa Polo
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'orphelins restants' AS check, count(*)::int AS n
FROM public.project_staff_needs
WHERE resource_request_id IS NULL
  AND statut IN ('soumis', 'en_recherche_rh');

SELECT n.ref_besoin, n.statut AS besoin_statut, n.corps_metier,
       r.ref_demande, r.statut AS demande_statut, r.project_name
FROM public.project_staff_needs n
LEFT JOIN public.resource_requests r ON r.id = n.resource_request_id
WHERE coalesce(r.project_name, '') ILIKE '%polo%'
   OR n.project_id IN (SELECT id FROM public.projects WHERE nom ILIKE '%polo%' OR ref ILIKE '%polo%')
ORDER BY n.created_at;
