-- CITYMO ERP — Vérifications sauvegarde complète + permissions sous-rubriques
-- Exécuter dans Supabase SQL Editor (ADD ONLY, idempotent)

-- 1) Liste tables public pour export complet backend
CREATE OR REPLACE FUNCTION public.get_public_table_names()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY_AGG(tablename ORDER BY tablename),
    ARRAY[]::TEXT[]
  )
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT IN ('schema_migrations');
$$;

REVOKE ALL ON FUNCTION public.get_public_table_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_table_names() TO service_role;

-- 2) Index permissions utilisateur (sous-rubriques)
CREATE INDEX IF NOT EXISTS idx_user_permission_exceptions_user_sub
  ON public.user_permission_exceptions(user_id, submodule_code);

-- 3) Forcer type complete sur planifications existantes (optionnel)
UPDATE public.erp_backup_schedules
SET backup_type = 'complete'
WHERE backup_type IS DISTINCT FROM 'complete';

COMMENT ON TABLE public.user_permission_exceptions IS
  'Exceptions par utilisateur — submodule_code = sous-rubrique ERP (ex: clients, employes, devis)';
