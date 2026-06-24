-- =============================================================================
-- CITYMO ERP — Vérifier quels scripts récents sont déjà appliqués sur Supabase
-- Coller dans SQL Editor → Run → lire la colonne status
-- =============================================================================

SELECT 'worker_project_assignments (affectation ouvriers/projet)' AS element,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_project_assignments'
  ) THEN 'OK — déjà fait' ELSE 'MANQUANT → RUN_PRESENCE_NOUVELLE_LOGIQUE.sql' END AS status
UNION ALL
SELECT 'attendance.is_legacy (archivage anciennes présences)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'is_legacy'
  ) THEN 'OK — déjà fait' ELSE 'MANQUANT → RUN_PRESENCE_NOUVELLE_LOGIQUE.sql' END
UNION ALL
SELECT 'projects.types_intervention (TCE / Gros œuvre / Second œuvre)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'types_intervention'
  ) THEN 'OK — déjà fait' ELSE 'MANQUANT → RUN_PROJECT_TYPES_INTERVENTION.sql' END
UNION ALL
SELECT 'subcontractor_project_assignments (sous-traitants/projet)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subcontractor_project_assignments'
  ) THEN 'OK — déjà fait' ELSE 'MANQUANT → RUN_SUBCONTRACTORS.sql' END
UNION ALL
SELECT 'internal_task_dg_relances (relances DG tâches)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'internal_task_dg_relances'
  ) THEN 'OK — déjà fait' ELSE 'MANQUANT → RUN_INTERNAL_TASKS_DG_RELANCES.sql' END
UNION ALL
SELECT 'attendance (table de base)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance'
  ) THEN 'OK' ELSE 'MANQUANT → RUN_PRESENCE_COMPLET.sql ou RUN_ATTENDANCE_NOW.sql' END
UNION ALL
SELECT 'projects (table de base)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) THEN 'OK' ELSE 'MANQUANT → RUN_PROJECTS_NOW.sql' END
ORDER BY element;
