-- =============================================================================
-- CITYMO — Vérifier si les tables Besoins Projet sont en place
-- Supabase → SQL Editor → Run
-- =============================================================================

SELECT element, status FROM (
  SELECT '1. project_staff_needs' AS element,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'project_staff_needs'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END AS status
  UNION ALL
  SELECT '2. Colonne type_besoin (formulaire v2)',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'project_staff_needs' AND column_name = 'type_besoin'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '3. resource_requests (RH)',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'resource_requests'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '4. Statut partielle / recrutement_en_cours',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'resource_requests_statut_check'
        AND pg_get_constraintdef(oid) LIKE '%recrutement_en_cours%'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '5. site_material_requests (matériel)',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'site_material_requests'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '6. worker_project_assignments (onglet Équipe)',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'worker_project_assignments'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '7. purchase_requests (rupture stock → achats)',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'purchase_requests'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
  UNION ALL
  SELECT '8. notifications (types RH + chantier)',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'notifications' AND c.conname = 'notifications_type_check'
        AND pg_get_constraintdef(c.oid) LIKE '%site_material_request%'
    ) THEN 'OK' ELSE 'MANQUANT → RUN_BESOINS_PROJET_TOUT.sql' END
) q
ORDER BY element;
