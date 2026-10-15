-- =============================================================================
-- CITYMO — Contrôle 48 h des demandes de ressources RH
-- Additif uniquement : aucune colonne, aucun statut, aucune donnée existante modifiés.
--
-- Règle : une demande (type ressource, sans parent) au statut « en_attente »
-- depuis plus de 48 h après sa création est « hors délai ».
--   • Alerte immédiate (une fois par demande) → super admins + département RH
--   • Rappel récapitulatif quotidien à 08:00 (Maroc) tant qu'il reste des retards
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Journal des alertes déjà envoyées (évite toute double alerte)
CREATE TABLE IF NOT EXISTS public.resource_request_sla_alerts (
  request_id uuid PRIMARY KEY REFERENCES public.resource_requests(id) ON DELETE CASCADE,
  first_alert_at timestamptz NOT NULL DEFAULT now(),
  seeded boolean NOT NULL DEFAULT false
);

ALTER TABLE public.resource_request_sla_alerts ENABLE ROW LEVEL SECURITY;

-- Destinataires : super admins / DG + département RH (profils actifs)
CREATE OR REPLACE FUNCTION public.resource_request_sla_recipients()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = ANY (public.list_super_admin_dg_user_ids())
  UNION
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.erp_roles r ON r.id = p.role_id
  WHERE lower(coalesce(p.statut, 'actif')) NOT IN ('inactif', 'suspendu')
    AND (p.department_id = 2 OR r.department_id = 2);
$$;

CREATE OR REPLACE FUNCTION public.check_resource_requests_sla(p_daily_digest boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_uid uuid;
  v_new integer := 0;
  v_late integer;
  v_refs text;
  v_projet text;
  v_retard text;
BEGIN
  -- 1) Première alerte pour chaque demande qui vient de dépasser 48 h
  FOR v_req IN
    SELECT rr.*
    FROM public.resource_requests rr
    WHERE rr.statut = 'en_attente'
      AND coalesce(rr.request_type, 'ressource') = 'ressource'
      AND rr.parent_request_id IS NULL
      AND rr.created_at < now() - interval '48 hours'
      AND NOT EXISTS (SELECT 1 FROM public.resource_request_sla_alerts a WHERE a.request_id = rr.id)
    ORDER BY rr.created_at
  LOOP
    v_projet := coalesce(nullif(v_req.project_name, ''), nullif(v_req.project_ref, ''), 'Projet');
    v_retard := CASE
      WHEN now() - v_req.created_at - interval '48 hours' < interval '1 hour' THEN 'à l''instant'
      ELSE 'depuis ' || floor(extract(epoch FROM (now() - v_req.created_at - interval '48 hours')) / 3600)::int || ' h'
    END;

    FOR v_uid IN SELECT * FROM public.resource_request_sla_recipients() LOOP
      PERFORM public.upsert_user_notification(
        v_uid,
        'Demande de ressources hors délai (48 h)',
        format('%s — %s : %s × %s. Non prise en charge par RH, délai de 48 h dépassé %s.',
               coalesce(v_req.ref_demande, 'Demande'), v_projet, v_req.quantite, v_req.fonction, v_retard),
        'resource_request',
        'urgent',
        'resource_request_overdue',
        v_req.id,
        'module:demandes-ressources',
        NULL,
        'demandes-ressources'
      );
    END LOOP;

    INSERT INTO public.resource_request_sla_alerts (request_id) VALUES (v_req.id)
    ON CONFLICT (request_id) DO NOTHING;
    v_new := v_new + 1;
  END LOOP;

  -- 2) Récapitulatif quotidien (une seule notification, remise en « non lue » chaque jour)
  IF p_daily_digest THEN
    SELECT count(*), string_agg(coalesce(rr.ref_demande, '—'), ', ' ORDER BY rr.created_at)
      INTO v_late, v_refs
    FROM public.resource_requests rr
    WHERE rr.statut = 'en_attente'
      AND coalesce(rr.request_type, 'ressource') = 'ressource'
      AND rr.parent_request_id IS NULL
      AND rr.created_at < now() - interval '48 hours';

    IF v_late > 0 THEN
      FOR v_uid IN SELECT * FROM public.resource_request_sla_recipients() LOOP
        PERFORM public.upsert_user_notification(
          v_uid,
          format('%s demande(s) de ressources hors délai', v_late),
          format('Toujours en attente RH après 48 h : %s.', v_refs),
          'resource_request',
          'urgent',
          'resource_requests_overdue_digest',
          '00000000-0000-4000-8000-000000000048'::uuid,
          'module:demandes-ressources',
          NULL,
          'demandes-ressources'
        );
      END LOOP;
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.check_resource_requests_sla(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resource_request_sla_recipients() FROM PUBLIC, anon, authenticated;

-- Demandes déjà hors délai à l'activation : pas d'alerte individuelle,
-- elles sont regroupées dans un seul récapitulatif.
INSERT INTO public.resource_request_sla_alerts (request_id, seeded)
SELECT rr.id, true
FROM public.resource_requests rr
WHERE rr.statut = 'en_attente'
  AND coalesce(rr.request_type, 'ressource') = 'ressource'
  AND rr.parent_request_id IS NULL
  AND rr.created_at < now() - interval '48 hours'
ON CONFLICT (request_id) DO NOTHING;

SELECT public.check_resource_requests_sla(true);

-- Planification (UTC) : contrôle chaque heure, récapitulatif à 07:00 UTC = 08:00 Maroc
SELECT cron.schedule('citymo_rh_sla_hourly', '5 * * * *', $cron$SELECT public.check_resource_requests_sla(false)$cron$);
SELECT cron.schedule('citymo_rh_sla_daily_digest', '0 7 * * *', $cron$SELECT public.check_resource_requests_sla(true)$cron$);
