-- =============================================================================
-- CITYMO ERP — Sécurité RLS complète (migration unique)
-- Supabase → SQL Editor → Run (ré-exécutable)
--
-- PRÉREQUIS : migrations ERP + RUN_NOTIFICATIONS_* + RUN_LEAVES_RH_MANAGER
-- DOCUMENTATION : supabase/RLS_SECURITY_AUDIT.md
--
-- Ce script :
--   1. Crée les helpers RBAC (erp_can, erp_auth_ok, erp_legacy_access)
--   2. Complète les permissions rôles (DG, chef_projet, chef_chantier)
--   3. Révoque les grants anon sur tables métier
--   4. Active RLS partout
--   5. Applique policies par module (sans USING(true) sur métier)
--   6. Policies CUSTOM (profiles, leaves, notifications, tâches DG, agenda)
--   7. Durcit SECURITY DEFINER
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 0 — PRÉREQUIS (fonctions absentes sur certaines instances)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_profile_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lower(coalesce(trim(statut), 'actif')) = 'actif' FROM public.profiles WHERE id = p_user_id),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_active(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_is_active(p_statut text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(trim(p_statut), 'actif')) = 'actif';
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — HELPERS RBAC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.erp_auth_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_profile_active(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.erp_auth_ok() TO authenticated;

COMMENT ON FUNCTION public.erp_auth_ok() IS
  'Utilisateur authentifié avec profil actif.';

CREATE OR REPLACE FUNCTION public.erp_legacy_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role_id IS NULL
      AND public.profile_is_active(p.statut)
  );
$$;

GRANT EXECUTE ON FUNCTION public.erp_legacy_access() TO authenticated;

COMMENT ON FUNCTION public.erp_legacy_access() IS
  'Rétrocompatibilité : comptes sans role_id (aligné permissions.js legacy).';

CREATE OR REPLACE FUNCTION public.erp_can(p_action text, p_submodule text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.erp_auth_ok()
    AND (
      public.is_super_admin()
      OR public.is_erp_admin()
      OR public.erp_legacy_access()
      OR public.has_submodule_permission(auth.uid(), p_submodule, p_action)
    );
$$;

GRANT EXECUTE ON FUNCTION public.erp_can(text, text) TO authenticated;

COMMENT ON FUNCTION public.erp_can(text, text) IS
  'Vérifie permission ERP : action (voir/creer/modifier/supprimer/valider/exporter) sur sous-rubrique.';

-- Renforcer has_submodule_permission (déjà présent via RUN_LEAVES_RH_MANAGER)
CREATE OR REPLACE FUNCTION public.has_submodule_permission(
  p_user_id uuid,
  p_submodule text,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT upe.granted
      FROM public.user_permission_exceptions upe
      WHERE upe.user_id = p_user_id
        AND upe.submodule_code = p_submodule
        AND upe.action_code = p_action
      LIMIT 1
    ),
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role_id = p.role_id
      WHERE p.id = p_user_id
        AND rp.submodule_code = p_submodule
        AND rp.action_code = p_action
        AND rp.granted = true
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_submodule_permission(uuid, text, text) TO authenticated;

-- Helper : utilisateur assigné à une tâche/RDV (nom ou employee_id)
CREATE OR REPLACE FUNCTION public.erp_is_task_assignee(
  p_responsable text,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.resolve_notification_recipient(
    NULL, p_employee_id, NULL, p_responsable
  ) = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.erp_is_task_assignee(text, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — SEED PERMISSIONS RÔLES MANQUANTS (DG, chef_projet, chef_chantier)
-- ═══════════════════════════════════════════════════════════════════════════

-- DG : lecture globale + valider/exporter
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE
    WHEN a.action_code = 'voir' THEN true
    WHEN a.action_code IN ('valider', 'exporter') THEN true
    WHEN a.action_code = 'creer' AND x.submodule_code IN ('taches', 'rendezvous') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne', 'dashboard'), ('organisation_interne', 'taches'),
  ('organisation_interne', 'rendezvous'), ('organisation_interne', 'agenda-direction'),
  ('ressources_humaines', 'departements'), ('ressources_humaines', 'employes'), ('ressources_humaines', 'conges'),
  ('ressources_humaines', 'demandes-ressources'),
  ('employes_externes', 'ouvriers'), ('employes_externes', 'presence'), ('employes_externes', 'heures-sup'),
  ('employes_externes', 'paiement-hebdo'), ('employes_externes', 'situation-sous-traitants'), ('employes_externes', 'sous-traitants'),
  ('commercial_marketing', 'prospects'), ('commercial_marketing', 'devis-attente'),
  ('commercial_marketing', 'planning-commercial'), ('commercial_marketing', 'actions-marketing'),
  ('commercial_marketing', 'compte-rendu-com'), ('commercial_marketing', 'depenses-com'), ('commercial_marketing', 'propositions'),
  ('crm', 'clients'), ('crm', 'articles'), ('crm', 'categories'), ('crm', 'devis'), ('crm', 'factures'), ('crm', 'bon-livraison'),
  ('logistique', 'vehicules'), ('logistique', 'interventions'), ('logistique', 'historique-interv'),
  ('projets', 'projets'), ('projets', 'sav-projets'), ('projets', 'cr-sav'),
  ('documents', 'mes-documents'), ('documents', 'docs-partages'), ('documents', 'liens-publics'),
  ('finance_tresorerie', 'finance-dashboard'), ('finance_tresorerie', 'feuille-caisse'),
  ('finance_tresorerie', 'categories-charge'), ('finance_tresorerie', 'charges'),
  ('finance_tresorerie', 'depenses-par-projet'), ('finance_tresorerie', 'ordres-paiement'),
  ('achats', 'demandes-achat'), ('achats', 'bons-commande'), ('achats', 'fournisseurs'),
  ('achats', 'comparaison-devis'), ('achats', 'ordres-achat'),
  ('inventaire_depot', 'categories-stock'), ('inventaire_depot', 'articles-stock'),
  ('inventaire_depot', 'depots'), ('inventaire_depot', 'bons-mouvements'),
  ('inventaire_depot', 'demandes-chantier'), ('inventaire_depot', 'stocks')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'dg'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Chef de projet
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE
    WHEN a.action_code IN ('voir', 'creer', 'modifier', 'exporter') THEN true
    WHEN a.action_code = 'valider' AND x.submodule_code IN ('projets', 'demandes-chantier') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne', 'dashboard'), ('organisation_interne', 'taches'), ('organisation_interne', 'rendezvous'),
  ('projets', 'projets'), ('projets', 'sav-projets'),
  ('inventaire_depot', 'demandes-chantier'),
  ('ressources_humaines', 'conges'),
  ('documents', 'mes-documents'),
  ('crm', 'devis'), ('crm', 'clients')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'chef_projet'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- Chef de chantier
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, x.module_code, x.submodule_code, a.action_code,
  CASE
    WHEN a.action_code IN ('voir', 'creer', 'modifier') THEN true
    WHEN a.action_code = 'exporter' AND x.submodule_code IN ('presence', 'demandes-chantier') THEN true
    ELSE false
  END
FROM public.erp_roles r
CROSS JOIN (VALUES
  ('organisation_interne', 'dashboard'), ('organisation_interne', 'taches'),
  ('projets', 'projets'),
  ('employes_externes', 'presence'),
  ('inventaire_depot', 'demandes-chantier'),
  ('ressources_humaines', 'conges'),
  ('documents', 'mes-documents')
) AS x(module_code, submodule_code)
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(action_code)
WHERE r.code = 'chef_chantier'
ON CONFLICT (role_id, submodule_code, action_code) DO UPDATE SET
  module_code = EXCLUDED.module_code,
  granted = EXCLUDED.granted;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 3 — RÉVOQUER ANON SUR TABLES MÉTIER
-- ═══════════════════════════════════════════════════════════════════════════

DO $revoke_anon$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$revoke_anon$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
REVOKE ALL ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 4 — HELPER : supprimer toutes les policies d'une table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._citymo_drop_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 5 — HELPER : policies standard module (SELECT/INSERT/UPDATE/DELETE)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._citymo_apply_module_rls(p_table text, p_submodule text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public._citymo_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.erp_can(''voir'', %L))',
    p_table || '_select', p_table, p_submodule
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.erp_can(''creer'', %L))',
    p_table || '_insert', p_table, p_submodule
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.erp_can(''modifier'', %L)) WITH CHECK (public.erp_can(''modifier'', %L))',
    p_table || '_update', p_table, p_submodule, p_submodule
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.erp_can(''supprimer'', %L))',
    p_table || '_delete', p_table, p_submodule
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 6 — APPLIQUER RLS MODULE SUR TOUTES LES TABLES MÉTIER
-- ═══════════════════════════════════════════════════════════════════════════

DO $apply_module$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- CRM / Commercial
      ('clients', 'clients'),
      ('prospects', 'prospects'),
      ('actions_marketing', 'actions-marketing'),
      ('planning_commercial', 'planning-commercial'),
      ('comptes_rendus', 'compte-rendu-com'),
      ('depenses', 'depenses-com'),
      ('propositions_marketing', 'propositions'),
      ('articles', 'articles'),
      ('categories', 'categories'),
      ('crm_devis', 'devis'),
      ('crm_devis_lignes', 'devis'),
      ('crm_factures', 'factures'),
      ('crm_facture_lignes', 'factures'),
      ('crm_facture_paiements', 'factures'),
      ('crm_archives', 'devis'),
      ('delivery_notes', 'bon-livraison'),
      ('delivery_note_items', 'bon-livraison'),
      ('devis', 'devis'),
      -- RH
      ('departments', 'departements'),
      ('employees', 'employes'),
      ('employee_documents', 'employes'),
      ('attendance', 'presence'),
      ('overtime', 'heures-sup'),
      ('payroll', 'paiement-hebdo'),
      ('resource_requests', 'demandes-ressources'),
      ('resource_request_history', 'demandes-ressources'),
      ('resource_request_workers', 'demandes-ressources'),
      -- Ouvriers / ST
      ('workers', 'ouvriers'),
      ('worker_documents', 'ouvriers'),
      ('worker_project_assignments', 'ouvriers'),
      ('subcontractors', 'sous-traitants'),
      ('subcontractor_documents', 'sous-traitants'),
      ('subcontractor_project_assignments', 'sous-traitants'),
      ('subcontractor_services', 'sous-traitants'),
      ('subcontractor_payments', 'sous-traitants'),
      ('subcontractor_project_adjustments', 'sous-traitants'),
      -- Projets
      ('projects', 'projets'),
      ('project_documents', 'projets'),
      ('project_expenses', 'depenses-par-projet'),
      ('project_material_needs', 'projets'),
      ('project_equipment_needs', 'projets'),
      ('project_staff_needs', 'projets'),
      ('project_staff_need_history', 'projets'),
      ('project_chantier_material_needs', 'projets'),
      ('project_chantier_material_need_lines', 'projets'),
      ('project_planning_tasks', 'projets'),
      ('project_planning_milestones', 'projets'),
      ('project_planning_comments', 'projets'),
      ('project_planning_resources', 'projets'),
      ('sav_requests', 'sav-projets'),
      ('sav_reports', 'cr-sav'),
      -- Finance
      ('finance_transactions', 'feuille-caisse'),
      ('cash_monthly_balances', 'feuille-caisse'),
      ('cash_daily_validations', 'feuille-caisse'),
      ('daily_cash_reviews', 'feuille-caisse'),
      ('finance_charges', 'charges'),
      ('finance_categories', 'categories-charge'),
      ('payment_orders', 'ordres-paiement'),
      -- Achats
      ('purchase_suppliers', 'fournisseurs'),
      ('purchase_requests', 'demandes-achat'),
      ('purchase_orders', 'bons-commande'),
      ('purchase_quote_comparisons', 'comparaison-devis'),
      ('purchase_acquisition_orders', 'ordres-achat'),
      ('purchase_request_history', 'demandes-achat'),
      ('purchase_request_quotes', 'demandes-achat'),
      ('achat_suppliers', 'fournisseurs'),
      ('achat_purchase_requests', 'demandes-achat'),
      ('achat_purchase_orders', 'bons-commande'),
      ('charge_categories', 'categories-charge'),
      -- Inventaire
      ('stock_categories', 'categories-stock'),
      ('stock_articles', 'articles-stock'),
      ('stock_warehouses', 'depots'),
      ('stock_levels', 'stocks'),
      ('stock_movements', 'bons-mouvements'),
      ('site_material_requests', 'demandes-chantier'),
      ('site_material_request_lines', 'demandes-chantier'),
      ('site_material_request_history', 'demandes-chantier'),
      -- Logistique
      ('vehicles', 'vehicules'),
      ('vehicle_intervention_requests', 'interventions'),
      ('vehicle_intervention_history', 'historique-interv'),
      ('vehicle_daily_reports', 'vehicules'),
      ('vehicle_daily_trips', 'vehicules'),
      -- Documents
      ('document_folders', 'mes-documents'),
      ('documents', 'mes-documents'),
      ('document_shares', 'docs-partages'),
      ('document_public_links', 'liens-publics'),
      ('ged_folders', 'mes-documents'),
      ('ged_documents', 'mes-documents'),
      ('ged_shares', 'docs-partages'),
      ('ged_public_links', 'liens-publics'),
      -- Organisation (sauf internal_tasks = custom)
      ('internal_appointments', 'rendezvous'),
      ('internal_task_dg_relances', 'taches')
    ) AS m(tbl, submodule)
    WHERE to_regclass('public.' || m.tbl) IS NOT NULL
  LOOP
    PERFORM public._citymo_apply_module_rls(rec.tbl, rec.submodule);
    RAISE NOTICE 'RLS module appliqué : % → %', rec.tbl, rec.submodule;
  END LOOP;
END
$apply_module$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 7 — POLICIES CUSTOM
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── profiles ───────────────────────────────────────────────────────────────
SELECT public._citymo_drop_policies('profiles');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated USING (public.is_erp_admin());

CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());

CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_erp_admin() OR auth.uid() = id);

-- ─── erp_roles / role_permissions (lecture RBAC, écriture admin) ─────────────
SELECT public._citymo_drop_policies('erp_roles');
ALTER TABLE public.erp_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_roles_select ON public.erp_roles
  FOR SELECT TO authenticated USING (public.erp_auth_ok());

CREATE POLICY erp_roles_write_admin ON public.erp_roles
  FOR ALL TO authenticated
  USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());

SELECT public._citymo_drop_policies('role_permissions');
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO authenticated USING (public.erp_auth_ok());

CREATE POLICY role_permissions_write_admin ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());

-- user_permission_exceptions : déjà OK, on réapplique proprement
SELECT public._citymo_drop_policies('user_permission_exceptions');
ALTER TABLE public.user_permission_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_perm_exc_select ON public.user_permission_exceptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_erp_admin());

CREATE POLICY user_perm_exc_write_admin ON public.user_permission_exceptions
  FOR ALL TO authenticated
  USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());

-- ─── leaves (conserver logique RH existante) ────────────────────────────────
SELECT public._citymo_drop_policies('leaves');
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY leaves_select_own ON public.leaves
  FOR SELECT TO authenticated USING (created_by = auth.uid());

CREATE POLICY leaves_select_rh ON public.leaves
  FOR SELECT TO authenticated USING (public.is_leave_rh_manager());

CREATE POLICY leaves_insert_own ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND statut = 'En attente');

CREATE POLICY leaves_update_own ON public.leaves
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND statut = 'En attente')
  WITH CHECK (created_by = auth.uid() AND statut = 'En attente');

CREATE POLICY leaves_update_rh ON public.leaves
  FOR UPDATE TO authenticated
  USING (public.is_leave_rh_manager()) WITH CHECK (public.is_leave_rh_manager());

CREATE POLICY leaves_delete_own ON public.leaves
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND statut = 'En attente');

CREATE POLICY leaves_delete_rh ON public.leaves
  FOR DELETE TO authenticated USING (public.is_leave_rh_manager());

-- ─── internal_tasks (tâches DG restreintes) ─────────────────────────────────
SELECT public._citymo_drop_policies('internal_tasks');
ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY internal_tasks_select ON public.internal_tasks
  FOR SELECT TO authenticated
  USING (
    public.erp_can('voir', 'taches')
    AND (
      NOT coalesce(is_dg_task, false)
      OR created_by = auth.uid()
      OR public.erp_is_task_assignee(responsable, responsable_employee_id)
      OR public.is_super_admin()
    )
  );

CREATE POLICY internal_tasks_insert ON public.internal_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'taches'));

CREATE POLICY internal_tasks_update ON public.internal_tasks
  FOR UPDATE TO authenticated
  USING (
    public.erp_can('modifier', 'taches')
    AND (
      NOT coalesce(is_dg_task, false)
      OR created_by = auth.uid()
      OR public.erp_is_task_assignee(responsable, responsable_employee_id)
      OR public.is_super_admin()
    )
  )
  WITH CHECK (public.erp_can('modifier', 'taches'));

CREATE POLICY internal_tasks_delete ON public.internal_tasks
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'taches') AND public.is_erp_admin());

-- ─── executive_calendar (conserver restrictions direction) ──────────────────
DO $exec_cal$
BEGIN
  IF to_regclass('public.executive_calendar') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('executive_calendar');
    ALTER TABLE public.executive_calendar ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      CREATE POLICY executive_calendar_select ON public.executive_calendar
        FOR SELECT TO authenticated USING (public.can_read_executive_calendar())
    $p$;
    EXECUTE $p$
      CREATE POLICY executive_calendar_insert ON public.executive_calendar
        FOR INSERT TO authenticated WITH CHECK (public.can_write_executive_calendar())
    $p$;
    EXECUTE $p$
      CREATE POLICY executive_calendar_update ON public.executive_calendar
        FOR UPDATE TO authenticated
        USING (public.can_write_executive_calendar())
        WITH CHECK (public.can_write_executive_calendar())
    $p$;
    EXECUTE $p$
      CREATE POLICY executive_calendar_delete ON public.executive_calendar
        FOR DELETE TO authenticated USING (public.can_write_executive_calendar())
    $p$;
  END IF;

  IF to_regclass('public.executive_calendar_notifications') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('executive_calendar_notifications');
    ALTER TABLE public.executive_calendar_notifications ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      CREATE POLICY exec_cal_notif_select ON public.executive_calendar_notifications
        FOR SELECT TO authenticated
        USING (user_id = auth.uid() AND public.can_read_executive_calendar())
    $p$;
    EXECUTE $p$
      CREATE POLICY exec_cal_notif_insert ON public.executive_calendar_notifications
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid() AND public.can_write_executive_calendar())
    $p$;
    EXECUTE $p$
      CREATE POLICY exec_cal_notif_update ON public.executive_calendar_notifications
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
    $p$;
  END IF;
END
$exec_cal$;

-- ─── notifications (lecture ciblée, écriture via RPC uniquement) ───────────
SELECT public._citymo_drop_policies('notifications');
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR is_global = true);

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid() OR is_global = true)
  WITH CHECK (recipient_user_id = auth.uid() OR is_global = true);

-- Pas d'INSERT direct client : insert_user_notification / upsert_user_notification (SECURITY DEFINER)
CREATE POLICY notifications_insert_block ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY notifications_delete_admin ON public.notifications
  FOR DELETE TO authenticated USING (public.is_erp_admin());

-- ─── whatsapp_notification_log ──────────────────────────────────────────────
DO $wa$
BEGIN
  IF to_regclass('public.whatsapp_notification_log') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('whatsapp_notification_log');
    ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      CREATE POLICY whatsapp_log_select_own ON public.whatsapp_notification_log
        FOR SELECT TO authenticated USING (user_id = auth.uid())
    $p$;
    EXECUTE $p$
      CREATE POLICY whatsapp_log_insert_service ON public.whatsapp_notification_log
        FOR INSERT TO authenticated WITH CHECK (public.is_erp_admin() OR user_id = auth.uid())
    $p$;
  END IF;
END
$wa$;

-- ─── erp_backups (Super Admin) ────────────────────────────────────────────────
DO $backups$
BEGIN
  IF to_regclass('public.erp_backups') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backups');
    ALTER TABLE public.erp_backups ENABLE ROW LEVEL SECURITY;
    EXECUTE $p$ CREATE POLICY erp_backups_super ON public.erp_backups FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin()) $p$;
  END IF;
  IF to_regclass('public.erp_backup_audit_log') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backup_audit_log');
    ALTER TABLE public.erp_backup_audit_log ENABLE ROW LEVEL SECURITY;
    EXECUTE $p$ CREATE POLICY erp_backup_audit_super ON public.erp_backup_audit_log FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin()) $p$;
  END IF;
  IF to_regclass('public.erp_backup_schedules') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backup_schedules');
    ALTER TABLE public.erp_backup_schedules ENABLE ROW LEVEL SECURITY;
    EXECUTE $p$ CREATE POLICY erp_backup_schedules_super ON public.erp_backup_schedules FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin()) $p$;
  END IF;
END
$backups$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 8 — DURCIR SECURITY DEFINER (search_path)
-- ═══════════════════════════════════════════════════════════════════════════

DO $harden$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public',
      fn.proname, fn.args
    );
  END LOOP;
END
$harden$;

-- Révoquer EXECUTE anon sur fonctions sensibles (sauf liens publics documents)
DO $revoke_fn$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN ('get_document_public_link', 'verify_document_public_link')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END
$revoke_fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 9 — VÉRIFICATIONS (Security Advisor manuel)
-- ═══════════════════════════════════════════════════════════════════════════

-- Tables sans RLS
SELECT c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
ORDER BY 1;

-- Policies permissives USING(true) restantes
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;

-- Grants anon restants sur tables
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
ORDER BY 1, 2;

-- Résumé policies par table
SELECT tablename, count(*) AS nb_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

NOTIFY pgrst, 'reload schema';

SELECT 'RUN_RLS_SECURITY_COMPLET terminé — voir RLS_SECURITY_AUDIT.md' AS status;
