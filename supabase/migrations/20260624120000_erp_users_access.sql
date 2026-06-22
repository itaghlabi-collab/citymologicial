-- CITYMO ERP — Accès utilisateurs (mot de passe temporaire, statut compte)
-- Exécuter après 20260622120000_administration_schema.sql
--              et 20260623120000_roles_departments_submodules.sql

-- ─── Forcer changement MDP à la première connexion ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_pwd ON public.profiles(must_change_password);

-- ─── Trigger auth.users → profiles (enrichi) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, nom, email, role, initiales,
    must_change_password, statut
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'employe'),
    COALESCE(
      NEW.raw_user_meta_data->>'initiales',
      upper(left(split_part(NEW.email, '@', 1), 2))
    ),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false),
    COALESCE(NEW.raw_user_meta_data->>'statut', 'actif')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nom = COALESCE(public.profiles.nom, EXCLUDED.nom),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── Lecture statut propre compte (connexion) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_profile_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT statut = 'actif' FROM public.profiles WHERE id = p_user_id),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_active(UUID) TO authenticated;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Si true, l''utilisateur doit changer son mot de passe à la prochaine connexion. MDP géré uniquement par Supabase Auth.';

COMMENT ON TABLE public.user_permission_exceptions IS
  'Surcharges permissions par utilisateur (prioritaire sur role_permissions).';
