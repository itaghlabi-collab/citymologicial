-- =============================================================================
-- CITYMO ERP — Fix SAFE Security Advisor (fonctions uniquement)
-- Fichier : supabase/RUN_SECURITY_FUNCTIONS_SAFE_FIX.sql
-- Version : 2026-07-08
--
-- ⚠️  Ne touche PAS : tables métier, policies RLS, données, workflows
-- ⚠️  Idempotent — ré-exécutable
--
-- Traite :
--   1. Function Search Path Mutable  → SET search_path = public
--   2. Public Can Execute SECURITY DEFINER → REVOKE public/anon + GRANT ciblés
--   3. (Optionnel / Error Advisor) Vue SECURITY DEFINER → security_invoker
--
-- Exécution : Supabase → SQL Editor → coller CE FICHIER ENTIER → Run
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 0 — PRECHECK (lecture seule)
-- ═══════════════════════════════════════════════════════════════════════════

-- Fonctions DEFINER sans search_path fixe
SELECT p.proname AS fonction,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.proconfig IS NOT NULL
                 AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
            THEN 'OK' ELSE 'À_CORRIGER' END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY 1, 2;

-- Grants EXECUTE pour anon / PUBLIC sur SECURITY DEFINER
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon=YES' ELSE 'anon=no' END AS anon_exec,
       CASE WHEN has_function_privilege('public', p.oid, 'EXECUTE') THEN 'PUBLIC=YES' ELSE 'PUBLIC=no' END AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY 1, 2;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — SEARCH PATH : toutes les fonctions public (sans changer le corps)
-- Idempotent : ALTER FUNCTION ... SET search_path = public
-- ═══════════════════════════════════════════════════════════════════════════

DO $search_path$
DECLARE
  fn record;
  v_ok int := 0;
  v_err int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p') -- function / procedure
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
      RAISE NOTICE 'SKIP search_path % : %', fn.sig, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'search_path fixé sur % fonction(s), % erreur(s)', v_ok, v_err;
END
$search_path$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger updated_at — search_path fixé (Security Advisor).';


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — EXECUTE : REVOKE public/anon sur SECURITY DEFINER + GRANT ciblés
--
-- Règles :
--   A) Liens documents publics (volontaire) :
--        get_document_public_link, verify_document_public_link
--        → GRANT anon + authenticated + service_role
--   B) Backup backend :
--        get_public_table_names
--        → service_role UNIQUEMENT
--   C) Toutes les autres SECURITY DEFINER :
--        → authenticated + service_role (plus de PUBLIC / anon)
--
-- Les triggers (handle_new_user, sync_*, trg_*) continuent de fonctionner
-- sans GRANT client : exécutés en tant que propriétaire de la fonction.
-- ═══════════════════════════════════════════════════════════════════════════

DO $revoke_grant$
DECLARE
  fn record;
  -- RPC volontairement appelables sans session (token document)
  keep_anon text[] := ARRAY[
    'get_document_public_link',
    'verify_document_public_link'
  ];
  -- Backend sauvegarde uniquement
  service_only text[] := ARRAY[
    'get_public_table_names'
  ];
  v_n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prokind IN ('f', 'p')
  LOOP
    -- Toujours retirer les grants trop larges
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);

    IF fn.proname = ANY (keep_anon) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
        fn.sig
      );
    ELSIF fn.proname = ANY (service_only) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    ELSE
      -- Helpers ERP / RLS / notifs / calendrier — session requise
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
        fn.sig
      );
    END IF;

    v_n := v_n + 1;
  END LOOP;

  -- Renforcer les commentaires ciblés (fonctions nommées, si présentes)
  BEGIN
    COMMENT ON FUNCTION public.erp_auth_ok() IS
      'Helper RLS ERP — authentifié uniquement. search_path=public. Pas d''EXECUTE anon.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.erp_can(text, text) IS
      'Helper permission ERP — authentifié uniquement. search_path=public. Pas d''EXECUTE anon.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.erp_legacy_access() IS
      'Rétrocompat comptes sans role_id — authentifié uniquement. Pas d''EXECUTE anon.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.profile_is_active(text) IS
      'Statut profil (texte) — IMMUTABLE ; search_path fixé. EXECUTE limité.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.is_profile_active(uuid) IS
      'Statut profil par user_id — authentifié. search_path=public.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.is_profile_active(text) IS
      'Alias rétrocompat de profile_is_active(text) — search_path=public.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.can_read_executive_calendar() IS
      'Agenda direction lecture — authentifié uniquement.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.can_write_executive_calendar() IS
      'Agenda direction écriture — authentifié uniquement.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.get_public_table_names() IS
      'Liste tables public — SERVICE_ROLE uniquement (sauvegardes backend).';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.get_document_public_link(text) IS
      'PUBLIC VOLONTAIRE : lecture lien document par token (sans login). Pas de listing.';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    COMMENT ON FUNCTION public.verify_document_public_link(text, text) IS
      'PUBLIC VOLONTAIRE : vérifie mot de passe lien document (token).';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  RAISE NOTICE 'EXECUTE revue sur % fonction(s) SECURITY DEFINER', v_n;
END
$revoke_grant$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 3 — Error Advisor : vue SECURITY DEFINER → security_invoker
-- Même SELECT métier. Aucun changement de données / tables / policies.
-- Postgres 15+ / Supabase : WITH (security_invoker = true)
-- ═══════════════════════════════════════════════════════════════════════════

DO $view_fix$
BEGIN
  IF to_regclass('public.subcontractor_project_balances') IS NULL THEN
    RAISE NOTICE 'Skip vue subcontractor_project_balances — absente';
    RETURN;
  END IF;

  -- Recréer la vue en INVOKER (RLS de l’appelant s’applique aux tables sous-jacentes)
  EXECUTE $v$
    CREATE OR REPLACE VIEW public.subcontractor_project_balances
    WITH (security_invoker = true)
    AS
    SELECT
      a.subcontractor_id,
      TRIM(COALESCE(s.prenom, '') || ' ' || COALESCE(s.nom, '')) AS subcontractor_name,
      a.project_id,
      COALESCE(p.nom, a.project_name, '—') AS project_name,
      a.id AS assignment_id,
      a.remuneration_type,
      COALESCE(svc_agg.total_services_amount, 0)::NUMERIC(14, 2) AS total_services_amount,
      COALESCE(pay_agg.total_paid_amount, 0)::NUMERIC(14, 2) AS total_paid_amount,
      (COALESCE(svc_agg.total_services_amount, 0) - COALESCE(pay_agg.total_paid_amount, 0))::NUMERIC(14, 2) AS remaining_amount,
      CASE
        WHEN COALESCE(pay_agg.total_paid_amount, 0) = 0 THEN 'non payé'
        WHEN (COALESCE(svc_agg.total_services_amount, 0) - COALESCE(pay_agg.total_paid_amount, 0)) > 0 THEN 'partiellement payé'
        ELSE 'payé'
      END AS payment_status
    FROM public.subcontractor_project_assignments a
    JOIN public.subcontractors s ON s.id = a.subcontractor_id
    LEFT JOIN public.projects p ON p.id = a.project_id
    LEFT JOIN (
      SELECT assignment_id, SUM(total_amount) AS total_services_amount
      FROM public.subcontractor_services
      WHERE status IN ('pending', 'validated', 'paid')
      GROUP BY assignment_id
    ) svc_agg ON svc_agg.assignment_id = a.id
    LEFT JOIN (
      SELECT assignment_id, SUM(amount) AS total_paid_amount
      FROM public.subcontractor_payments
      WHERE status = 'paid'
      GROUP BY assignment_id
    ) pay_agg ON pay_agg.assignment_id = a.id
  $v$;

  GRANT SELECT ON public.subcontractor_project_balances TO authenticated;
  RAISE NOTICE 'Vue subcontractor_project_balances → security_invoker=true';
END
$view_fix$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 4 — POST-CHECK
-- ═══════════════════════════════════════════════════════════════════════════

-- DEFINER encore sans search_path ?
SELECT p.proname AS encore_sans_search_path,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
  )
ORDER BY 1, 2;

-- DEFINER encore exécutable par anon ?
SELECT p.proname AS encore_anon_execute,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT IN ('get_document_public_link', 'verify_document_public_link')
ORDER BY 1, 2;

-- Confirmation grants volontaires (docs publics)
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_document_public_link', 'verify_document_public_link', 'get_public_table_names')
ORDER BY 1;

NOTIFY pgrst, 'reload schema';

SELECT 'RUN_SECURITY_FUNCTIONS_SAFE_FIX terminé — recharger Security Advisor' AS status;
