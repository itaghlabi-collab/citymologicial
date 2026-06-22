-- CITYMO ERP — Module Administration (utilisateurs, rôles, permissions, sauvegardes)
-- Exécuter dans Supabase SQL Editor. Aucun DROP de données existantes.

-- ─── Extension profiles (lien RH + statut compte) ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prenom TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telephone TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'actif';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_statut ON public.profiles(statut);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_statut_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_statut_check
      CHECK (statut IN ('actif', 'inactif', 'suspendu'));
  END IF;
END $$;

-- ─── Rôles ERP ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  description TEXT,
  statut      TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  est_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS erp_roles_updated_at ON public.erp_roles;
CREATE TRIGGER erp_roles_updated_at
  BEFORE UPDATE ON public.erp_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.erp_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);

-- ─── Permissions par rôle ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id      UUID NOT NULL REFERENCES public.erp_roles(id) ON DELETE CASCADE,
  module_code  TEXT NOT NULL,
  action_code  TEXT NOT NULL CHECK (action_code IN ('voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter')),
  granted      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, module_code, action_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);

-- ─── Journal sauvegardes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_backups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL UNIQUE,
  nom           TEXT,
  type          TEXT NOT NULL DEFAULT 'manuelle',
  module_code   TEXT,
  planification TEXT NOT NULL DEFAULT 'manuelle',
  statut        TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('succes', 'en_cours', 'erreur', 'planifie')),
  taille_bytes  BIGINT,
  description   TEXT,
  cree_par      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cree_par_nom  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_backups_created ON public.erp_backups(created_at DESC);

-- ─── Sync profiles.role (texte legacy) depuis erp_roles ─────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_erp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_code TEXT;
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    SELECT code INTO role_code FROM public.erp_roles WHERE id = NEW.role_id;
    IF role_code IS NOT NULL THEN
      NEW.role := role_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_role ON public.profiles;
CREATE TRIGGER profiles_sync_role
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_erp();

-- ─── Helper admin ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_erp_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.erp_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND r.est_admin = true
      AND r.statut = 'actif'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_erp_admin() TO authenticated;

-- ─── Seed rôles de base ──────────────────────────────────────────────────────
INSERT INTO public.erp_roles (code, nom, description, est_admin, statut) VALUES
  ('super_admin', 'Super Admin', 'Accès complet à tout le système', true, 'actif'),
  ('dg', 'DG', 'Lecture globale et validations stratégiques', false, 'actif'),
  ('rh', 'RH', 'Gestion RH et personnel', false, 'actif'),
  ('finance', 'Finance', 'Finance, trésorerie et caisse', false, 'actif'),
  ('commercial', 'Commercial', 'CRM, devis et prospection', false, 'actif'),
  ('achats', 'Achats', 'Achats et fournisseurs', false, 'actif'),
  ('logistique', 'Logistique', 'Logistique, inventaire et dépôt', false, 'actif'),
  ('chef_projet', 'Chef de projet', 'Suivi projets et coordination', false, 'actif'),
  ('chef_chantier', 'Chef de chantier', 'Chantiers et terrain', false, 'actif'),
  ('employe', 'Employé', 'Accès limité tâches, congés et documents', false, 'actif')
ON CONFLICT (code) DO UPDATE SET
  nom = EXCLUDED.nom,
  description = EXCLUDED.description,
  est_admin = EXCLUDED.est_admin,
  statut = EXCLUDED.statut;

UPDATE public.profiles p
SET role_id = r.id
FROM public.erp_roles r
WHERE r.code = 'super_admin'
  AND (
    lower(p.role) = 'super_admin'
    OR lower(p.email) = lower('selim.moumni@citymo.ma')
  )
  AND p.role_id IS NULL;

INSERT INTO public.role_permissions (role_id, module_code, action_code, granted)
SELECT r.id, m.module_code, a.action_code,
  CASE
    WHEN a.action_code = 'voir' THEN true
    WHEN a.action_code = 'valider' AND m.module_code IN ('finance_tresorerie', 'rh', 'projets') THEN true
    WHEN a.action_code = 'exporter' AND m.module_code IN ('finance_tresorerie', 'rh', 'projets', 'crm') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne'), ('rh'), ('employes_externes'), ('commercial_marketing'),
  ('crm'), ('logistique'), ('projets'), ('documents'), ('finance_tresorerie'),
  ('achats'), ('inventaire_depot'), ('administration')
) AS m(module_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'dg'
ON CONFLICT (role_id, module_code, action_code) DO UPDATE SET granted = EXCLUDED.granted;

INSERT INTO public.role_permissions (role_id, module_code, action_code, granted)
SELECT r.id, m.module_code, a.action_code,
  CASE
    WHEN m.module_code = 'rh' AND a.action_code IN ('voir', 'creer') THEN true
    WHEN m.module_code = 'documents' AND a.action_code = 'voir' THEN true
    WHEN m.module_code = 'organisation_interne' AND a.action_code IN ('voir', 'modifier') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne'), ('rh'), ('employes_externes'), ('commercial_marketing'),
  ('crm'), ('logistique'), ('projets'), ('documents'), ('finance_tresorerie'),
  ('achats'), ('inventaire_depot'), ('administration')
) AS m(module_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'employe'
ON CONFLICT (role_id, module_code, action_code) DO UPDATE SET granted = EXCLUDED.granted;

INSERT INTO public.role_permissions (role_id, module_code, action_code, granted)
SELECT r.id, m.module_code, a.action_code,
  CASE
    WHEN m.module_code IN ('rh', 'employes_externes', 'organisation_interne') THEN true
    WHEN m.module_code = 'documents' AND a.action_code IN ('voir', 'exporter') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne'), ('rh'), ('employes_externes'), ('commercial_marketing'),
  ('crm'), ('logistique'), ('projets'), ('documents'), ('finance_tresorerie'),
  ('achats'), ('inventaire_depot'), ('administration')
) AS m(module_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'rh'
ON CONFLICT (role_id, module_code, action_code) DO UPDATE SET granted = EXCLUDED.granted;

INSERT INTO public.role_permissions (role_id, module_code, action_code, granted)
SELECT r.id, m.module_code, a.action_code, true
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne'), ('rh'), ('employes_externes'), ('commercial_marketing'),
  ('crm'), ('logistique'), ('projets'), ('documents'), ('finance_tresorerie'),
  ('achats'), ('inventaire_depot'), ('administration')
) AS m(module_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'super_admin'
ON CONFLICT (role_id, module_code, action_code) DO UPDATE SET granted = EXCLUDED.granted;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.erp_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_roles_select_auth ON public.erp_roles;
CREATE POLICY erp_roles_select_auth ON public.erp_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS erp_roles_write_admin ON public.erp_roles;
CREATE POLICY erp_roles_write_admin ON public.erp_roles
  FOR ALL TO authenticated
  USING (public.is_erp_admin())
  WITH CHECK (public.is_erp_admin());

DROP POLICY IF EXISTS role_permissions_select_auth ON public.role_permissions;
CREATE POLICY role_permissions_select_auth ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_permissions_write_admin ON public.role_permissions;
CREATE POLICY role_permissions_write_admin ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_erp_admin())
  WITH CHECK (public.is_erp_admin());

DROP POLICY IF EXISTS erp_backups_select_admin ON public.erp_backups;
CREATE POLICY erp_backups_select_admin ON public.erp_backups
  FOR SELECT TO authenticated USING (public.is_erp_admin());

DROP POLICY IF EXISTS erp_backups_write_admin ON public.erp_backups;
CREATE POLICY erp_backups_write_admin ON public.erp_backups
  FOR ALL TO authenticated
  USING (public.is_erp_admin())
  WITH CHECK (public.is_erp_admin());

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_erp_admin());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_erp_admin())
  WITH CHECK (public.is_erp_admin());

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_erp_admin() OR auth.uid() = id);
