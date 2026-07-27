-- Accès dépenses générales pour h.barkaoui@citymo.ma
-- À exécuter dans Supabase SQL Editor (production).
--
-- Accorde :
--   • categories-charge : voir / créer / modifier / supprimer / valider / exporter
--   • charges           : voir / créer / modifier / supprimer / valider / exporter
--
-- Nécessaire pour :
--   1. Menu « Catégories charge » + lecture finance_categories (RLS)
--   2. Suppression de lignes de dépense (charges:supprimer)
--   3. Création / modification avec pièces jointes (charges:creer|modifier)

DO $$
DECLARE
  v_uid uuid;
  v_sub text;
  v_act text;
BEGIN
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE lower(email) = lower('h.barkaoui@citymo.ma')
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable pour h.barkaoui@citymo.ma — créez le compte Auth/Utilisateur d''abord.';
  END IF;

  -- Retirer d’anciennes exceptions sur ces deux sous-rubriques uniquement
  DELETE FROM public.user_permission_exceptions
  WHERE user_id = v_uid
    AND submodule_code IN ('charges', 'categories-charge');

  FOREACH v_sub IN ARRAY ARRAY['charges', 'categories-charge']
  LOOP
    FOREACH v_act IN ARRAY ARRAY['voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter']
    LOOP
      INSERT INTO public.user_permission_exceptions (user_id, submodule_code, action_code, granted)
      VALUES (v_uid, v_sub, v_act, true);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'OK — droits charges + categories-charge accordés à % (%)', 'h.barkaoui@citymo.ma', v_uid;
END $$;

SELECT upe.submodule_code, upe.action_code, upe.granted
FROM public.user_permission_exceptions upe
JOIN public.profiles p ON p.id = upe.user_id
WHERE lower(p.email) = lower('h.barkaoui@citymo.ma')
  AND upe.submodule_code IN ('charges', 'categories-charge')
ORDER BY 1, 2;
