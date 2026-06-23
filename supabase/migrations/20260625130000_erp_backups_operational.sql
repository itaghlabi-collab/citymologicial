-- CITYMO ERP — Sauvegardes opérationnelles (étape 1 : local Supabase/Railway)
-- ADD ONLY — pas de DROP / TRUNCATE de données métier

-- ─── Extension table erp_backups ─────────────────────────────────────────────
ALTER TABLE public.erp_backups
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  ADD COLUMN IF NOT EXISTS schedule_type TEXT;

COMMENT ON COLUMN public.erp_backups.file_path IS 'Chemin du fichier dans le provider (ex: citymo-backups/BCK-2026-1234/db.json.gz)';
COMMENT ON COLUMN public.erp_backups.storage_provider IS 'local | supabase_storage | google_drive (futur)';

-- ─── Journal d''audit sauvegardes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_backup_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id   UUID REFERENCES public.erp_backups(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (action IN ('create', 'download', 'restore', 'delete', 'schedule', 'error')),
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_backup_audit_created ON public.erp_backup_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_backup_audit_backup ON public.erp_backup_audit_log(backup_id);

-- ─── Planification sauvegardes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_backup_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type   TEXT NOT NULL DEFAULT 'complete',
  planification TEXT NOT NULL CHECK (planification IN ('quotidienne', 'hebdomadaire', 'mensuelle')),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_backup_schedules_next ON public.erp_backup_schedules(next_run_at)
  WHERE enabled = true;

-- ─── Helper : liste tables public (service_role / backend uniquement) ────────
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

-- ─── Bucket stockage sauvegardes (privé) ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-backups',
  'citymo-backups',
  false,
  524288000,
  ARRAY[
    'application/json',
    'application/gzip',
    'application/x-gzip',
    'application/octet-stream',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Lecture : super admin uniquement
DROP POLICY IF EXISTS citymo_backups_select ON storage.objects;
CREATE POLICY citymo_backups_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'citymo-backups' AND public.is_super_admin());

-- Écriture : super admin (backend service_role bypass RLS)
DROP POLICY IF EXISTS citymo_backups_insert ON storage.objects;
CREATE POLICY citymo_backups_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'citymo-backups' AND public.is_super_admin());

DROP POLICY IF EXISTS citymo_backups_delete ON storage.objects;
CREATE POLICY citymo_backups_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'citymo-backups' AND public.is_super_admin());

-- ─── RLS : sauvegardes réservées SUPER_ADMIN ─────────────────────────────────
ALTER TABLE public.erp_backup_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_backup_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_backups_select_admin ON public.erp_backups;
CREATE POLICY erp_backups_select_super ON public.erp_backups
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS erp_backups_write_admin ON public.erp_backups;
CREATE POLICY erp_backups_write_super ON public.erp_backups
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS erp_backup_audit_select ON public.erp_backup_audit_log;
CREATE POLICY erp_backup_audit_select ON public.erp_backup_audit_log
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS erp_backup_audit_insert ON public.erp_backup_audit_log;
CREATE POLICY erp_backup_audit_insert ON public.erp_backup_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS erp_backup_schedules_super ON public.erp_backup_schedules;
CREATE POLICY erp_backup_schedules_super ON public.erp_backup_schedules
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
