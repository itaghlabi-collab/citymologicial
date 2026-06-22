-- =============================================================================
-- CITYMO ERP — Scripts Supabase Administration / Utilisateurs / Accès ERP
-- Exécuter dans Supabase SQL Editor, DANS L'ORDRE, une seule fois chaque fichier.
-- =============================================================================
--
-- ORDRE D'EXÉCUTION :
--
--   1) supabase/migrations/20260622120000_administration_schema.sql
--      → profiles étendu, erp_roles, role_permissions, erp_backups, RLS admin
--
--   2) supabase/migrations/20260623120000_roles_departments_submodules.sql
--      → départements liés aux rôles, permissions par sous-rubrique, exceptions
--
--   3) supabase/migrations/20260624120000_erp_users_access.sql  (ci-dessous)
--      → must_change_password, trigger auth, statut compte
--
-- PRÉREQUIS : migrations RH + is_super_admin() déjà appliquées
--             (20260525000000_rh_schema.sql + 20260525200000_leaves_rls_super_admin.sql)
--
-- IMPORTANT :
--   - Les mots de passe sont UNIQUEMENT dans auth.users (Supabase Auth)
--   - Jamais de mot de passe en clair dans profiles / employees
--   - profiles = infos ERP + rôle + statut + lien employé RH
--
-- =============================================================================

-- ─── ÉTAPE 3 : Accès utilisateurs ERP ────────────────────────────────────────
-- (Copier le contenu de 20260624120000_erp_users_access.sql ou exécuter ce bloc)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_pwd ON public.profiles(must_change_password);

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

-- =============================================================================
-- SCRIPT 4 (optionnel mais recommandé) — connexion immédiate sans email de confirmation
-- Fichier : supabase/migrations/20260624130000_auto_confirm_auth_users.sql
-- =============================================================================

-- =============================================================================
-- TABLES RÉCAPITULATIF
-- auth.users          → connexion email + mot de passe (Supabase Auth)
-- public.profiles     → profil ERP, role_id, employee_id, statut, must_change_password
-- public.employees    → données RH (lien optionnel)
-- public.erp_roles    → rôles + department_id
-- public.role_permissions → permissions par sous-rubrique
-- public.user_permission_exceptions → surcharges par utilisateur
-- public.erp_backups  → journal sauvegardes
-- =============================================================================
