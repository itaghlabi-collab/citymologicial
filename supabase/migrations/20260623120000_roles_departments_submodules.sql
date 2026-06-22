-- CITYMO ERP — Rôles liés aux départements + permissions par sous-rubrique
-- Exécuter dans Supabase SQL Editor après 20260622120000_administration_schema.sql

-- ─── Lien rôle → département (référence departments existant) ───────────────
ALTER TABLE public.erp_roles
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_roles_department ON public.erp_roles(department_id);

-- ─── Permissions granulaires par sous-rubrique ───────────────────────────────
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS submodule_code TEXT;

CREATE INDEX IF NOT EXISTS idx_role_permissions_submodule ON public.role_permissions(submodule_code);

-- Nouvelle unicité par sous-rubrique (remplace l’ancienne par module seul)
ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_role_id_module_code_action_code_key;

DELETE FROM public.role_permissions WHERE submodule_code IS NULL;

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_role_submodule_action_key
  UNIQUE (role_id, submodule_code, action_code);

-- ─── Exceptions utilisateur (surcharge du rôle) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_permission_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submodule_code  TEXT NOT NULL,
  action_code     TEXT NOT NULL CHECK (action_code IN ('voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter')),
  granted         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, submodule_code, action_code)
);

CREATE INDEX IF NOT EXISTS idx_user_perm_exc_user ON public.user_permission_exceptions(user_id);

ALTER TABLE public.user_permission_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_perm_exc_select ON public.user_permission_exceptions;
CREATE POLICY user_perm_exc_select ON public.user_permission_exceptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_erp_admin());

DROP POLICY IF EXISTS user_perm_exc_write_admin ON public.user_permission_exceptions;
CREATE POLICY user_perm_exc_write_admin ON public.user_permission_exceptions
  FOR ALL TO authenticated
  USING (public.is_erp_admin())
  WITH CHECK (public.is_erp_admin());

-- ─── Mettre à jour rôles seed avec départements ──────────────────────────────
UPDATE public.erp_roles SET department_id = 7  WHERE code = 'super_admin' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 7  WHERE code = 'dg' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 2  WHERE code = 'rh' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 6  WHERE code = 'finance' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 1  WHERE code = 'commercial' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 3  WHERE code = 'achats' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 9  WHERE code = 'logistique' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 5  WHERE code = 'chef_projet' AND department_id IS NULL;
UPDATE public.erp_roles SET department_id = 5  WHERE code = 'chef_chantier' AND department_id IS NULL;

-- ─── Permissions RH (sous-rubriques RH + employés externes) ────────────────
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE
    WHEN a.action_code IN ('voir', 'creer', 'modifier', 'valider', 'exporter') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('ressources_humaines', 'departements'),
  ('ressources_humaines', 'employes'),
  ('ressources_humaines', 'conges'),
  ('employes_externes', 'ouvriers'),
  ('employes_externes', 'presence'),
  ('employes_externes', 'heures-sup'),
  ('employes_externes', 'paiement-hebdo'),
  ('employes_externes', 'situation-sous-traitants'),
  ('employes_externes', 'sous-traitants')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'rh'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Finance : toutes sous-rubriques finance
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'finance_tresorerie', x.submodule_code, a.action_code,
  CASE WHEN a.action_code = 'supprimer' THEN false ELSE true END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('finance-dashboard'), ('feuille-caisse'), ('categories-charge'), ('charges'), ('ordres-paiement')
) AS x(submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'finance'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Commercial + CRM
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE WHEN a.action_code = 'supprimer' THEN false ELSE true END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('commercial_marketing', 'prospects'), ('commercial_marketing', 'devis-attente'),
  ('commercial_marketing', 'planning-commercial'), ('commercial_marketing', 'actions-marketing'),
  ('commercial_marketing', 'compte-rendu-com'), ('commercial_marketing', 'depenses-com'),
  ('commercial_marketing', 'propositions'),
  ('crm', 'clients'), ('crm', 'articles'), ('crm', 'categories'),
  ('crm', 'devis'), ('crm', 'factures'), ('crm', 'bon-livraison')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'commercial'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Achats
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'achats', x.submodule_code, a.action_code,
  CASE WHEN a.action_code = 'supprimer' THEN false ELSE true END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('demandes-achat'), ('bons-commande'), ('fournisseurs'), ('comparaison-devis'), ('ordres-achat')
) AS x(submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'achats'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Logistique + Inventaire
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE WHEN a.action_code IN ('supprimer', 'valider') THEN false ELSE true END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('logistique', 'vehicules'), ('logistique', 'interventions'), ('logistique', 'historique-interv'),
  ('inventaire_depot', 'categories-stock'), ('inventaire_depot', 'articles-stock'),
  ('inventaire_depot', 'depots'), ('inventaire_depot', 'bons-mouvements'), ('inventaire_depot', 'stocks')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'logistique'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Employé : accès minimal
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE
    WHEN x.submodule_code IN ('dashboard', 'taches', 'conges', 'mes-documents') AND a.action_code IN ('voir', 'creer', 'modifier') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne', 'dashboard'),
  ('organisation_interne', 'taches'),
  ('ressources_humaines', 'conges'),
  ('documents', 'mes-documents')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'employe'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Super Admin : toutes sous-rubriques
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code, true
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne', 'dashboard'), ('organisation_interne', 'taches'),
  ('organisation_interne', 'rendezvous'), ('organisation_interne', 'agenda-direction'),
  ('ressources_humaines', 'departements'), ('ressources_humaines', 'employes'), ('ressources_humaines', 'conges'),
  ('employes_externes', 'ouvriers'), ('employes_externes', 'presence'), ('employes_externes', 'heures-sup'),
  ('employes_externes', 'paiement-hebdo'), ('employes_externes', 'situation-sous-traitants'), ('employes_externes', 'sous-traitants'),
  ('commercial_marketing', 'prospects'), ('commercial_marketing', 'devis-attente'),
  ('commercial_marketing', 'planning-commercial'), ('commercial_marketing', 'actions-marketing'),
  ('commercial_marketing', 'compte-rendu-com'), ('commercial_marketing', 'depenses-com'), ('commercial_marketing', 'propositions'),
  ('crm', 'clients'), ('crm', 'articles'), ('crm', 'categories'), ('crm', 'devis'), ('crm', 'factures'), ('crm', 'bon-livraison'),
  ('logistique', 'vehicules'), ('logistique', 'interventions'), ('logistique', 'historique-interv'),
  ('projets', 'projets'), ('projets', 'sav-projets'), ('projets', 'cr-sav'),
  ('documents', 'mes-documents'), ('documents', 'docs-partages'), ('documents', 'liens-publics'), ('documents', 'corbeille'),
  ('finance_tresorerie', 'finance-dashboard'), ('finance_tresorerie', 'feuille-caisse'),
  ('finance_tresorerie', 'categories-charge'), ('finance_tresorerie', 'charges'), ('finance_tresorerie', 'ordres-paiement'),
  ('achats', 'demandes-achat'), ('achats', 'bons-commande'), ('achats', 'fournisseurs'),
  ('achats', 'comparaison-devis'), ('achats', 'ordres-achat'),
  ('inventaire_depot', 'categories-stock'), ('inventaire_depot', 'articles-stock'),
  ('inventaire_depot', 'depots'), ('inventaire_depot', 'bons-mouvements'), ('inventaire_depot', 'stocks'),
  ('administration', 'utilisateurs'), ('administration', 'roles'), ('administration', 'sauvegardes')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'super_admin'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;
