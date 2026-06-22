-- CITYMO ERP — Connexion immédiate après création compte (sans email de confirmation)
-- Exécuter dans Supabase SQL Editor après les scripts Administration 1-2-3
--
-- Alternative manuelle : Supabase Dashboard → Authentication → Providers → Email
--   → désactiver "Confirm email"

-- Confirme automatiquement l'email à la création dans auth.users
CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := NOW();
  END IF;
  IF NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_auth_user();
