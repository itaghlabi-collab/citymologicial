-- Droits Fabrication complets pour a.hjiej@citymo.ma (Abdelghani HJIEJ)
-- À exécuter dans Supabase SQL Editor (production).
--
-- Accorde UNIQUEMENT à cet utilisateur (user_id résolu par e-mail) :
--   fabrication
--   fabrication-plans-projets
--   fabrication-plans
--   fabrication-suivi
--   fabrication-terminee
--   fabrication-bons-livraison
-- × voir / creer / modifier / supprimer / valider / exporter
--
-- Nécessaire pour :
--   1. Bouton « + DÉBUTER UNE PRODUCTION » / « Débuter » (fabrication-plans:creer)
--   2. Ancien circuit « Affecter » et vue non filtrée (fabrication-plans:valider)
--   3. Bibliothèque Plans / Projets (creer / modifier)
--   4. Suivi de production (modifier)
--   5. Bon de livraison Fabrication
--
-- Ne touche ni les modèles de rôle, ni les autres utilisateurs,
-- ni les exceptions hors sous-rubriques Fabrication.

DO $$
DECLARE
  v_uid uuid;
  v_sub text;
  v_act text;
  v_subs text[] := ARRAY[
    'fabrication',
    'fabrication-plans-projets',
    'fabrication-plans',
    'fabrication-suivi',
    'fabrication-terminee',
    'fabrication-bons-livraison'
  ];
  v_acts text[] := ARRAY['voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter'];
BEGIN
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE lower(email) = lower('a.hjiej@citymo.ma')
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable pour a.hjiej@citymo.ma';
  END IF;

  DELETE FROM public.user_permission_exceptions
  WHERE user_id = v_uid
    AND submodule_code = ANY (v_subs);

  FOREACH v_sub IN ARRAY v_subs
  LOOP
    FOREACH v_act IN ARRAY v_acts
    LOOP
      INSERT INTO public.user_permission_exceptions (user_id, submodule_code, action_code, granted)
      VALUES (v_uid, v_sub, v_act, true)
      ON CONFLICT (user_id, submodule_code, action_code) DO UPDATE SET granted = true;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'OK — Fabrication complète accordée à % (%)', 'a.hjiej@citymo.ma', v_uid;
END $$;

SELECT
  p.id AS user_id,
  p.email,
  p.role AS profile_role,
  r.code AS role_code,
  r.nom AS role_nom,
  r.est_admin
FROM public.profiles p
LEFT JOIN public.erp_roles r ON r.id = p.role_id
WHERE lower(p.email) = lower('a.hjiej@citymo.ma');

SELECT upe.submodule_code, upe.action_code, upe.granted
FROM public.user_permission_exceptions upe
JOIN public.profiles p ON p.id = upe.user_id
WHERE lower(p.email) = lower('a.hjiej@citymo.ma')
  AND upe.submodule_code LIKE 'fabrication%'
ORDER BY 1, 2;
