-- =============================================================================
-- CITYMO ERP — ORDRE D'EXÉCUTION SUPABASE
-- Utilisateurs (sous-rubriques) + Sauvegardes complètes + MDP manuel
--
-- Où : Supabase Dashboard → SQL Editor → New query → Coller → Run
-- Règle : exécuter UN script à la fois, dans l'ordre ci-dessous.
-- Tous les scripts sont ADD ONLY (pas de DROP de données métier).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 0 — VÉRIFICATION (lire le résultat avant de continuer)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'erp_roles') AS has_erp_roles,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_permission_exceptions') AS has_user_exceptions,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'must_change_password') AS has_must_change_pwd,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'erp_backups' AND column_name = 'file_path') AS has_backups_operational,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'erp_backups' AND column_name = 'drive_synced') AS has_backups_drive,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_public_table_names') AS has_export_tables_fn,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'citymo-backups') AS has_backups_bucket;

-- Interprétation :
--   has_erp_roles = false          → exécuter ÉTAPE 1
--   has_user_exceptions = false    → exécuter ÉTAPE 2
--   has_must_change_pwd = false    → exécuter ÉTAPE 3
--   has_backups_operational = false → exécuter ÉTAPE 4
--   has_backups_drive = false      → exécuter ÉTAPE 5 (si Google Drive activé)
--   has_export_tables_fn = false   → exécuter ÉTAPE 4 ou 6
--   has_backups_bucket = false     → exécuter ÉTAPE 4

-- =============================================================================
-- ÉTAPE 1 — Administration de base (si has_erp_roles = false)
-- Fichier : supabase/migrations/20260622120000_administration_schema.sql
-- =============================================================================

-- =============================================================================
-- ÉTAPE 2 — Permissions par sous-rubrique (si has_user_exceptions = false)
-- Fichier : supabase/migrations/20260623120000_roles_departments_submodules.sql
-- =============================================================================

-- =============================================================================
-- ÉTAPE 3 — Accès utilisateurs + MDP temporaire (si has_must_change_pwd = false)
-- Fichier : supabase/migrations/20260624120000_erp_users_access.sql
-- Optionnel recommandé : supabase/migrations/20260624130000_auto_confirm_auth_users.sql
-- =============================================================================

-- =============================================================================
-- ÉTAPE 4 — Sauvegardes opérationnelles (OBLIGATOIRE pour sauvegardes complètes)
-- Fichier : supabase/migrations/20260625130000_erp_backups_operational.sql
-- OU copier-coller le contenu de : supabase/RUN_ERP_BACKUPS_COMPLET.sql
-- =============================================================================

-- =============================================================================
-- ÉTAPE 5 — Google Drive (optionnel — 2e copie sauvegardes)
-- Fichier : supabase/migrations/20260626120000_erp_backups_google_drive.sql
-- =============================================================================

-- =============================================================================
-- ÉTAPE 6 — Finalisation utilisateurs + sauvegarde complète (TOUJOURS exécuter)
-- Fichier : supabase/RUN_ERP_USERS_BACKUPS.sql
-- =============================================================================
