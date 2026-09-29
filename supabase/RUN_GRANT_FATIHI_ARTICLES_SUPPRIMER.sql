-- Droit de suppression des articles CRM pour n.fatihi@citymo.ma (Nourddine FATIHI)
-- À exécuter dans Supabase SQL Editor (production).
--
-- Accorde uniquement :
--   • articles : supprimer

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE lower(email) = lower('n.fatihi@citymo.ma')
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable pour n.fatihi@citymo.ma';
  END IF;

  INSERT INTO public.user_permission_exceptions (user_id, submodule_code, action_code, granted)
  VALUES (v_uid, 'articles', 'supprimer', true)
  ON CONFLICT (user_id, submodule_code, action_code) DO UPDATE SET granted = true;

  RAISE NOTICE 'OK — articles:supprimer accordé à % (%)', 'n.fatihi@citymo.ma', v_uid;
END $$;

SELECT upe.submodule_code, upe.action_code, upe.granted
FROM public.user_permission_exceptions upe
JOIN public.profiles p ON p.id = upe.user_id
WHERE lower(p.email) = lower('n.fatihi@citymo.ma')
  AND upe.submodule_code = 'articles'
ORDER BY 1, 2;
