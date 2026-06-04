-- ═══════════════════════════════════════════════════════════════════════════
-- CITYMO — Audit schéma Supabase (lecture seule, sans modification)
-- Projet attendu : https://npddbwsskaojcawaxygh.supabase.co
-- Coller dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tables attendues par l'application (public)
WITH expected AS (
  SELECT unnest(ARRAY[
    'departments', 'profiles', 'employees', 'leaves', 'attendance', 'payroll',
    'internal_tasks', 'internal_appointments',
    'workers', 'worker_documents', 'overtime',
    'prospects', 'devis', 'planning_commercial', 'actions_marketing',
    'comptes_rendus', 'depenses', 'propositions_marketing',
    'clients', 'categories', 'articles',
    'crm_devis', 'crm_devis_lignes', 'crm_factures', 'crm_facture_lignes', 'crm_facture_paiements',
    'delivery_notes', 'delivery_note_items',
    'vehicles', 'vehicle_intervention_requests', 'vehicle_intervention_history',
    'projects', 'project_documents', 'sav_requests', 'sav_reports'
  ]) AS table_name
)
SELECT
  e.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MANQUANTE' END AS status
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.table_name
ORDER BY status DESC, e.table_name;

-- 2) Comptage lignes (tables existantes uniquement)
DO $$
DECLARE
  r RECORD;
  sql TEXT;
  cnt BIGINT;
BEGIN
  RAISE NOTICE '=== ROW COUNTS (public) ===';
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    sql := format('SELECT COUNT(*) FROM public.%I', r.table_name);
    EXECUTE sql INTO cnt;
    RAISE NOTICE '% : %', r.table_name, cnt;
  END LOOP;
END $$;

-- 3) RLS activée ?
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 4) Buckets Storage
SELECT id, name, public FROM storage.buckets ORDER BY id;
