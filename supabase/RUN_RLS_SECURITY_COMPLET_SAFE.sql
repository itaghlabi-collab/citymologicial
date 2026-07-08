-- =============================================================================
-- CITYMO ERP — Sécurité RLS (version SAFE — ne pas exécuter sans validation)
-- Fichier : supabase/RUN_RLS_SECURITY_COMPLET_SAFE.sql
-- Version : 2026-07-08
-- Référence audit : supabase/RLS_SECURITY_AUDIT.md
--
-- ⚠️  PRODUCTION — lire entièrement avant exécution
-- ⚠️  Ce script NE modifie PAS les données métier par défaut
-- ⚠️  Les sections SEED et HARDENING sont désactivées (commentées)
--
-- Convention fonctions statut profil :
--   profile_is_active(text)  → vérifie la colonne statut ('actif' / autre)
--   is_profile_active(uuid)  → vérifie un utilisateur par id
--   is_profile_active(text)  → alias rétrocompat (délègue à profile_is_active)
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 0 — PRECHECK (lecture + garde-fou — arrêt si prérequis critiques absents)
-- ═══════════════════════════════════════════════════════════════════════════

-- 0.1 Tables critiques
SELECT 'TABLE' AS check_type, t AS object_name,
  CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY[
  'profiles', 'erp_roles', 'role_permissions', 'user_permission_exceptions',
  'notifications', 'leaves', 'internal_tasks'
]) AS t
ORDER BY 1, 2;

-- 0.2 Colonnes profiles utilisées par les helpers
SELECT 'COLUMN' AS check_type, c.col AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c.col
  ) THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY['id', 'statut', 'role_id', 'role', 'email', 'employee_id', 'nom']) AS c(col)
ORDER BY 2;

-- 0.3 Colonnes notifications (si table présente)
SELECT 'COLUMN' AS check_type, c.col AS object_name,
  CASE WHEN to_regclass('public.notifications') IS NULL THEN 'SKIP (pas de table)'
       WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = c.col
       ) THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY[
  'recipient_user_id', 'is_global', 'title', 'entity_type', 'entity_id', 'type'
]) AS c(col)
ORDER BY 2;

-- 0.4 Fonctions RPC notifications (informatif — seront créées si absentes en PARTIE 1)
SELECT 'FUNCTION' AS check_type, f.sig AS object_name,
  CASE WHEN to_regprocedure(f.sig) IS NOT NULL THEN 'OK' ELSE 'SERA_CRÉÉE' END AS status
FROM (VALUES
  ('public.insert_user_notification(uuid,text,text,text,text,text,uuid,text,uuid,text)'),
  ('public.upsert_user_notification(uuid,text,text,text,text,text,uuid,text,uuid,text)'),
  ('public.resolve_notification_recipient(uuid,uuid,text,text)'),
  ('public.profile_is_active(text)'),
  ('public.is_profile_active(uuid)')
) AS f(sig)
ORDER BY 2;

-- 0.5 Profils sans role_id (risque erp_legacy_access — informatif uniquement)
SELECT 'DATA' AS check_type, 'profiles_sans_role_id' AS object_name,
  count(*)::text AS status
FROM public.profiles
WHERE role_id IS NULL;

-- 0.6 GARDE-FOU : arrêt si prérequis critiques manquants
DO $precheck$
DECLARE
  v_missing_tables text[];
  v_missing_cols text[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_missing_tables
  FROM unnest(ARRAY['profiles', 'erp_roles', 'role_permissions']) AS t
  WHERE to_regclass('public.' || t) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'PRECHECK ECHEC — tables critiques manquantes : %. Migration RLS annulée.',
      array_to_string(v_missing_tables, ', ');
  END IF;

  SELECT array_agg(c ORDER BY c) INTO v_missing_cols
  FROM unnest(ARRAY['id', 'statut', 'role_id']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c
  );

  IF v_missing_cols IS NOT NULL THEN
    RAISE EXCEPTION
      'PRECHECK ECHEC — colonnes profiles manquantes : %. Migration RLS annulée.',
      array_to_string(v_missing_cols, ', ');
  END IF;

  RAISE NOTICE 'PRECHECK OK — poursuite de la migration SAFE';
END
$precheck$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — FONCTIONS FONDATION (ordre strict : aucun appel avant définition)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1 Statut texte (fonction canonique)
CREATE OR REPLACE FUNCTION public.profile_is_active(p_statut text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(coalesce(trim(p_statut), 'actif')) = 'actif';
$$;

COMMENT ON FUNCTION public.profile_is_active(text) IS
  'Vérifie qu''un statut profil est actif (insensible à la casse).';

-- 1.2 Alias rétrocompatibilité : corrige les appels erronés is_profile_active(p.statut)
CREATE OR REPLACE FUNCTION public.is_profile_active(p_statut text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.profile_is_active(p_statut);
$$;

COMMENT ON FUNCTION public.is_profile_active(text) IS
  'Alias rétrocompat — préférer profile_is_active(text) dans le nouveau code.';

-- 1.3 Statut par user_id (surcharge uuid — distincte de la version text)
CREATE OR REPLACE FUNCTION public.is_profile_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT public.profile_is_active(statut) FROM public.profiles WHERE id = p_user_id),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_active(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(trim(regexp_replace(
    translate(coalesce(p_name, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'),
    '\s+', ' ', 'g'
  )));
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        lower(role) IN ('super_admin', 'super admin')
        OR lower(email) IN (lower('selim.moumni@citymo.ma'), lower('selim.moumni@gmail.com'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

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

CREATE OR REPLACE FUNCTION public.is_erp_admin()
RETURNS boolean
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

CREATE OR REPLACE FUNCTION public.is_leave_rh_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR (
      public.has_submodule_permission(auth.uid(), 'employes', 'voir')
      AND public.has_submodule_permission(auth.uid(), 'conges', 'voir')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_leave_rh_manager() TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(trim(regexp_replace(
    translate(coalesce(p_role, ''), 'éèêëàâäùûüôöîïç', 'eeeeaaauuuooiic'),
    '\s+', ' ', 'g'
  )));
$$;

CREATE OR REPLACE FUNCTION public.can_read_executive_calendar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.normalize_profile_role(p.role) IN (
      'admin', 'administrateur', 'super admin', 'super_admin',
      'assistante de direction', 'assistante direction',
      'directeur general', 'directeur_general', 'dg'
    )
    OR lower(coalesce(p.email, '')) = lower('selim.moumni@citymo.ma')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_write_executive_calendar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.normalize_profile_role(p.role) IN (
      'admin', 'administrateur', 'super admin', 'super_admin',
      'assistante de direction', 'assistante direction',
      'directeur general', 'directeur_general', 'dg'
    )
    OR lower(coalesce(p.email, '')) = lower('selim.moumni@citymo.ma')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.can_read_executive_calendar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_executive_calendar() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_notification_recipient(
  p_user_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_assignee_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_emp_id uuid;
  v_emp_email text;
  v_name text;
  v_norm text;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE id = p_user_id AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT p.id INTO v_uid FROM public.profiles p
    WHERE p.employee_id = p_employee_id AND public.profile_is_active(p.statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

    SELECT e.email INTO v_emp_email FROM public.employees e WHERE e.id = p_employee_id LIMIT 1;
    IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(trim(v_emp_email)) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;
  END IF;

  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE lower(email) = lower(trim(p_email)) AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  v_name := trim(coalesce(p_assignee_name, ''));
  IF v_name <> '' THEN
    IF position('@' in v_name) > 0 THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(v_name) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;

    v_norm := public.normalize_person_name(v_name);
    SELECT e.id, e.email INTO v_emp_id, v_emp_email
    FROM public.employees e
    WHERE lower(coalesce(e.statut, 'actif')) <> 'inactif'
      AND (
        public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)) = v_norm
        OR public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname)) = v_norm
        OR public.normalize_person_name(e.lastname) = v_norm
        OR public.normalize_person_name(e.firstname) = v_norm
      )
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_emp_id IS NOT NULL THEN
      SELECT p.id INTO v_uid FROM public.profiles p
      WHERE p.employee_id = v_emp_id AND public.profile_is_active(p.statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

      IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
        SELECT id INTO v_uid FROM public.profiles
        WHERE lower(email) = lower(trim(v_emp_email)) AND public.profile_is_active(statut) LIMIT 1;
        IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
      END IF;
    END IF;

    SELECT id INTO v_uid FROM public.profiles
    WHERE public.normalize_person_name(nom) = v_norm AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_notification_recipient(uuid, uuid, text, text) TO authenticated;

-- RPC notifications (uniquement si table notifications présente)
DO $notif_rpc$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'Skip RPC notifications — table notifications absente';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.insert_user_notification(
      p_recipient_user_id uuid,
      p_title text,
      p_message text DEFAULT NULL,
      p_type text DEFAULT 'system',
      p_priority text DEFAULT 'normal',
      p_entity_type text DEFAULT NULL,
      p_entity_id uuid DEFAULT NULL,
      p_action_url text DEFAULT NULL,
      p_created_by uuid DEFAULT NULL,
      p_submodule_code text DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_row public.notifications;
    BEGIN
      IF p_recipient_user_id IS NULL OR trim(coalesce(p_title, '')) = '' THEN
        RETURN NULL;
      END IF;

      INSERT INTO public.notifications (
        recipient_user_id, title, message, type, priority,
        entity_type, entity_id, action_url, created_by, submodule_code,
        is_read, read_at
      ) VALUES (
        p_recipient_user_id,
        trim(p_title),
        NULLIF(trim(coalesce(p_message, '')), ''),
        coalesce(p_type, 'system'),
        coalesce(p_priority, 'normal'),
        p_entity_type,
        p_entity_id,
        p_action_url,
        p_created_by,
        p_submodule_code,
        false,
        NULL
      )
      RETURNING * INTO v_row;

      RETURN to_jsonb(v_row);
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.upsert_user_notification(
      p_recipient_user_id uuid,
      p_title text,
      p_message text DEFAULT NULL,
      p_type text DEFAULT 'system',
      p_priority text DEFAULT 'normal',
      p_entity_type text DEFAULT NULL,
      p_entity_id uuid DEFAULT NULL,
      p_action_url text DEFAULT NULL,
      p_created_by uuid DEFAULT NULL,
      p_submodule_code text DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_row public.notifications;
      v_type text := coalesce(p_type, 'system');
    BEGIN
      IF p_recipient_user_id IS NULL OR trim(coalesce(p_title, '')) = '' THEN
        RETURN NULL;
      END IF;

      IF p_entity_type IS NULL OR p_entity_id IS NULL THEN
        RETURN public.insert_user_notification(
          p_recipient_user_id, p_title, p_message, v_type, p_priority,
          p_entity_type, p_entity_id, p_action_url, p_created_by, p_submodule_code
        );
      END IF;

      BEGIN
        INSERT INTO public.notifications (
          recipient_user_id, title, message, type, priority,
          entity_type, entity_id, action_url, created_by, submodule_code,
          is_read, read_at
        ) VALUES (
          p_recipient_user_id,
          trim(p_title),
          NULLIF(trim(coalesce(p_message, '')), ''),
          v_type,
          coalesce(p_priority, 'normal'),
          p_entity_type,
          p_entity_id,
          p_action_url,
          p_created_by,
          p_submodule_code,
          false,
          NULL
        )
        RETURNING * INTO v_row;
      EXCEPTION WHEN unique_violation THEN
        UPDATE public.notifications
        SET
          title = trim(p_title),
          message = NULLIF(trim(coalesce(p_message, '')), ''),
          priority = coalesce(p_priority, 'normal'),
          action_url = p_action_url,
          submodule_code = p_submodule_code,
          is_read = false,
          read_at = NULL,
          created_at = now()
        WHERE recipient_user_id = p_recipient_user_id
          AND entity_type = p_entity_type
          AND entity_id = p_entity_id
          AND type = v_type
        RETURNING * INTO v_row;
      END;

      RETURN CASE WHEN v_row IS NULL THEN NULL ELSE to_jsonb(v_row) END;
    END;
    $body$;
  $fn$;

  CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_user_idx
    ON public.notifications (recipient_user_id, entity_type, entity_id, type)
    WHERE recipient_user_id IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL;

  GRANT EXECUTE ON FUNCTION public.insert_user_notification(
    uuid, text, text, text, text, text, uuid, text, uuid, text
  ) TO authenticated;

  GRANT EXECUTE ON FUNCTION public.upsert_user_notification(
    uuid, text, text, text, text, text, uuid, text, uuid, text
  ) TO authenticated;
END
$notif_rpc$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — HELPERS RBAC (après fondation)
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
-- PARTIE 3 — SEED PERMISSIONS (DÉSACTIVÉ — ne modifie pas les données)
-- Décommenter uniquement après validation explicite en staging
-- ═══════════════════════════════════════════════════════════════════════════

/*
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

-- Chef de projet + chef de chantier : voir RUN_RLS_SECURITY_COMPLET.sql PARTIE 2
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 4 — GRANTS (révoque anon sur tables métier)
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
-- PARTIE 5 — HELPERS RLS (drop policies + apply atomique)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._citymo_drop_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._citymo_apply_module_rls(p_table text, p_submodule text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'Skip RLS — table absente : %', p_table;
    RETURN;
  END IF;

  PERFORM public._citymo_drop_policies(p_table);

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

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 6 — RLS MODULE (tables existantes uniquement)
-- ═══════════════════════════════════════════════════════════════════════════

DO $apply_module$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
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
      ('departments', 'departements'),
      ('employees', 'employes'),
      ('employee_documents', 'employes'),
      ('attendance', 'presence'),
      ('overtime', 'heures-sup'),
      ('payroll', 'paiement-hebdo'),
      ('resource_requests', 'demandes-ressources'),
      ('resource_request_history', 'demandes-ressources'),
      ('resource_request_workers', 'demandes-ressources'),
      ('workers', 'ouvriers'),
      ('worker_documents', 'ouvriers'),
      ('worker_project_assignments', 'ouvriers'),
      ('subcontractors', 'sous-traitants'),
      ('subcontractor_documents', 'sous-traitants'),
      ('subcontractor_project_assignments', 'sous-traitants'),
      ('subcontractor_services', 'sous-traitants'),
      ('subcontractor_payments', 'sous-traitants'),
      ('subcontractor_project_adjustments', 'sous-traitants'),
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
      ('finance_transactions', 'feuille-caisse'),
      ('cash_monthly_balances', 'feuille-caisse'),
      ('cash_daily_validations', 'feuille-caisse'),
      ('daily_cash_reviews', 'feuille-caisse'),
      ('finance_charges', 'charges'),
      ('finance_categories', 'categories-charge'),
      ('payment_orders', 'ordres-paiement'),
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
      ('stock_categories', 'categories-stock'),
      ('stock_articles', 'articles-stock'),
      ('stock_warehouses', 'depots'),
      ('stock_levels', 'stocks'),
      ('stock_movements', 'bons-mouvements'),
      ('site_material_requests', 'demandes-chantier'),
      ('site_material_request_lines', 'demandes-chantier'),
      ('site_material_request_history', 'demandes-chantier'),
      ('vehicles', 'vehicules'),
      ('vehicle_intervention_requests', 'interventions'),
      ('vehicle_intervention_history', 'historique-interv'),
      ('vehicle_daily_reports', 'vehicules'),
      ('vehicle_daily_trips', 'vehicules'),
      ('document_folders', 'mes-documents'),
      ('documents', 'mes-documents'),
      ('document_shares', 'docs-partages'),
      ('document_public_links', 'liens-publics'),
      ('ged_folders', 'mes-documents'),
      ('ged_documents', 'mes-documents'),
      ('ged_shares', 'docs-partages'),
      ('ged_public_links', 'liens-publics'),
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
-- PARTIE 7 — POLICIES CUSTOM (table par table, policies AVANT ENABLE RLS)
-- ═══════════════════════════════════════════════════════════════════════════

DO $profiles_rls$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip profiles RLS — table absente';
    RETURN;
  END IF;

  PERFORM public._citymo_drop_policies('profiles');

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

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
END
$profiles_rls$;

DO $erp_roles_rls$
BEGIN
  IF to_regclass('public.erp_roles') IS NULL THEN RETURN; END IF;
  PERFORM public._citymo_drop_policies('erp_roles');
  CREATE POLICY erp_roles_select ON public.erp_roles
    FOR SELECT TO authenticated USING (public.erp_auth_ok());
  CREATE POLICY erp_roles_write_admin ON public.erp_roles
    FOR ALL TO authenticated
    USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());
  ALTER TABLE public.erp_roles ENABLE ROW LEVEL SECURITY;
END
$erp_roles_rls$;

DO $role_perms_rls$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN RETURN; END IF;
  PERFORM public._citymo_drop_policies('role_permissions');
  CREATE POLICY role_permissions_select ON public.role_permissions
    FOR SELECT TO authenticated USING (public.erp_auth_ok());
  CREATE POLICY role_permissions_write_admin ON public.role_permissions
    FOR ALL TO authenticated
    USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());
  ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
END
$role_perms_rls$;

DO $user_perm_exc_rls$
BEGIN
  IF to_regclass('public.user_permission_exceptions') IS NULL THEN RETURN; END IF;
  PERFORM public._citymo_drop_policies('user_permission_exceptions');
  CREATE POLICY user_perm_exc_select ON public.user_permission_exceptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_erp_admin());
  CREATE POLICY user_perm_exc_write_admin ON public.user_permission_exceptions
    FOR ALL TO authenticated
    USING (public.is_erp_admin()) WITH CHECK (public.is_erp_admin());
  ALTER TABLE public.user_permission_exceptions ENABLE ROW LEVEL SECURITY;
END
$user_perm_exc_rls$;

DO $leaves_rls$
BEGIN
  IF to_regclass('public.leaves') IS NULL THEN RETURN; END IF;
  PERFORM public._citymo_drop_policies('leaves');
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
  ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
END
$leaves_rls$;

DO $internal_tasks_rls$
BEGIN
  IF to_regclass('public.internal_tasks') IS NULL THEN RETURN; END IF;
  PERFORM public._citymo_drop_policies('internal_tasks');
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
    FOR INSERT TO authenticated WITH CHECK (public.erp_can('creer', 'taches'));
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
  ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;
END
$internal_tasks_rls$;

DO $exec_cal$
BEGIN
  IF to_regclass('public.executive_calendar') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('executive_calendar');
    CREATE POLICY executive_calendar_select ON public.executive_calendar
      FOR SELECT TO authenticated USING (public.can_read_executive_calendar());
    CREATE POLICY executive_calendar_insert ON public.executive_calendar
      FOR INSERT TO authenticated WITH CHECK (public.can_write_executive_calendar());
    CREATE POLICY executive_calendar_update ON public.executive_calendar
      FOR UPDATE TO authenticated
      USING (public.can_write_executive_calendar())
      WITH CHECK (public.can_write_executive_calendar());
    CREATE POLICY executive_calendar_delete ON public.executive_calendar
      FOR DELETE TO authenticated USING (public.can_write_executive_calendar());
    ALTER TABLE public.executive_calendar ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.executive_calendar_notifications') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('executive_calendar_notifications');
    CREATE POLICY exec_cal_notif_select ON public.executive_calendar_notifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() AND public.can_read_executive_calendar());
    CREATE POLICY exec_cal_notif_insert ON public.executive_calendar_notifications
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND public.can_write_executive_calendar());
    CREATE POLICY exec_cal_notif_update ON public.executive_calendar_notifications
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    ALTER TABLE public.executive_calendar_notifications ENABLE ROW LEVEL SECURITY;
  END IF;
END
$exec_cal$;

DO $notifications_rls$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN; END IF;

  IF to_regprocedure('public.insert_user_notification(uuid,text,text,text,text,text,uuid,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION
      'notifications RLS annulée — insert_user_notification absente. Exécuter PARTIE 1 d''abord.';
  END IF;

  PERFORM public._citymo_drop_policies('notifications');
  CREATE POLICY notifications_select ON public.notifications
    FOR SELECT TO authenticated
    USING (recipient_user_id = auth.uid() OR is_global = true);
  CREATE POLICY notifications_update ON public.notifications
    FOR UPDATE TO authenticated
    USING (recipient_user_id = auth.uid() OR is_global = true)
    WITH CHECK (recipient_user_id = auth.uid() OR is_global = true);
  CREATE POLICY notifications_insert_block ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (false);
  CREATE POLICY notifications_delete_admin ON public.notifications
    FOR DELETE TO authenticated USING (public.is_erp_admin());
  ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
END
$notifications_rls$;

DO $wa$
BEGIN
  IF to_regclass('public.whatsapp_notification_log') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('whatsapp_notification_log');
    CREATE POLICY whatsapp_log_select_own ON public.whatsapp_notification_log
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY whatsapp_log_insert_service ON public.whatsapp_notification_log
      FOR INSERT TO authenticated WITH CHECK (public.is_erp_admin() OR user_id = auth.uid());
    ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;
  END IF;
END
$wa$;

DO $backups$
BEGIN
  IF to_regclass('public.erp_backups') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backups');
    CREATE POLICY erp_backups_super ON public.erp_backups
      FOR ALL TO authenticated
      USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
    ALTER TABLE public.erp_backups ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.erp_backup_audit_log') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backup_audit_log');
    CREATE POLICY erp_backup_audit_super ON public.erp_backup_audit_log
      FOR ALL TO authenticated
      USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
    ALTER TABLE public.erp_backup_audit_log ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.erp_backup_schedules') IS NOT NULL THEN
    PERFORM public._citymo_drop_policies('erp_backup_schedules');
    CREATE POLICY erp_backup_schedules_super ON public.erp_backup_schedules
      FOR ALL TO authenticated
      USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
    ALTER TABLE public.erp_backup_schedules ENABLE ROW LEVEL SECURITY;
  END IF;
END
$backups$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 8 — HARDENING (DÉSACTIVÉ par défaut — décommenter après tests staging)
-- ═══════════════════════════════════════════════════════════════════════════

/*
DO $harden$
DECLARE fn record;
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

DO $revoke_fn$
DECLARE fn record;
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
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 9 — POST-CHECK (lecture seule)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
ORDER BY 1;

SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;

SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
ORDER BY 1, 2;

SELECT tablename, count(*) AS nb_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

NOTIFY pgrst, 'reload schema';

SELECT 'RUN_RLS_SECURITY_COMPLET_SAFE terminé — valider avec checklist §RLS_SECURITY_AUDIT.md' AS status;
