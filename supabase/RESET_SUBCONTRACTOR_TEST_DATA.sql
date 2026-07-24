-- =============================================================================
-- CITYMO — RESET_SUBCONTRACTOR_TEST_DATA.sql
-- Remise à zéro des données opérationnelles du module Situation sous-traitants
--
-- USAGE :
--   1) Exécuter d’abord AUDIT_SUBCONTRACTOR_RESET.sql (volumes)
--   2) Lire ce script, vérifier les sections
--   3) Exécuter ce fichier TEL QUEL → se termine par ROLLBACK (simulation)
--   4) Après validation explicite : commenter ROLLBACK et décommenter COMMIT
--
-- CONSERVE :
--   subcontractors, assignments, documents, projects, permissions,
--   corps de métier, finance_transactions (caisse), autres modules
--
-- SUPPRIME (module Situation uniquement) :
--   imputations, events, retenues, evaluations (optionnel),
--   situations, avances globales, payments ST, adjustments projet
--
-- NE FAIT PAS :
--   DROP TABLE, DELETE profils, DELETE projets, DELETE caisse
-- =============================================================================

BEGIN;

-- ─── Snapshot avant (pour comparaison dans la même session) ──────────────────
CREATE TEMP TABLE IF NOT EXISTS _st_reset_before AS
SELECT 'before'::text AS phase, 'situations'::text AS objet,
  (SELECT COUNT(*)::bigint FROM public.subcontractor_situations) AS n
UNION ALL SELECT 'before', 'avances',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_global_advances)
UNION ALL SELECT 'before', 'imputations',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_advance_imputations)
UNION ALL SELECT 'before', 'events',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_account_events)
UNION ALL SELECT 'before', 'retenues',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_retenues)
UNION ALL SELECT 'before', 'evaluations',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_evaluations)
UNION ALL SELECT 'before', 'payments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_payments)
UNION ALL SELECT 'before', 'adjustments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_project_adjustments)
UNION ALL SELECT 'before', 'profils',
  (SELECT COUNT(*)::bigint FROM public.subcontractors)
UNION ALL SELECT 'before', 'assignments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_project_assignments);

-- ─── Ordre FK-safe ───────────────────────────────────────────────────────────
-- 1. Imputations (RESTRICT sur advances)
DELETE FROM public.subcontractor_advance_imputations;

-- 2. Journal d’événements du compte
DELETE FROM public.subcontractor_account_events;

-- 3. Retenues dédiées (V3)
DELETE FROM public.subcontractor_retenues;

-- 4. Évaluations performance (fiche Analyse — données de test du module)
DELETE FROM public.subcontractor_evaluations;

-- 5. Délier paiements → situations (sécurité si FK SET NULL insuffisant)
UPDATE public.subcontractor_payments
SET situation_id = NULL
WHERE situation_id IS NOT NULL;

-- 6. Situations (y compris historiques / sans projet / group_id)
DELETE FROM public.subcontractor_situations;

-- 7. Avances globales
DELETE FROM public.subcontractor_global_advances;

-- 8. Ajustements avance/retenue « pending » liés aux paiements projet
DELETE FROM public.subcontractor_project_adjustments;

-- 9. Tous les paiements du module Situation sous-traitants
--    (= source des KPI travaux / net / « Sans projet »)
DELETE FROM public.subcontractor_payments;

-- ─── OPTIONNEL — prestations / services (décommenter si besoin) ──────────────
-- Les prestations (subcontractor_services) ne sont PAS le cœur « Situation »
-- du compte courant V2. Conservées par défaut.
-- DELETE FROM public.subcontractor_services;

-- ─── Vérification après delete (même transaction) ────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _st_reset_after AS
SELECT 'after'::text AS phase, 'situations'::text AS objet,
  (SELECT COUNT(*)::bigint FROM public.subcontractor_situations) AS n
UNION ALL SELECT 'after', 'avances',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_global_advances)
UNION ALL SELECT 'after', 'imputations',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_advance_imputations)
UNION ALL SELECT 'after', 'events',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_account_events)
UNION ALL SELECT 'after', 'retenues',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_retenues)
UNION ALL SELECT 'after', 'evaluations',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_evaluations)
UNION ALL SELECT 'after', 'payments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_payments)
UNION ALL SELECT 'after', 'adjustments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_project_adjustments)
UNION ALL SELECT 'after', 'profils',
  (SELECT COUNT(*)::bigint FROM public.subcontractors)
UNION ALL SELECT 'after', 'assignments',
  (SELECT COUNT(*)::bigint FROM public.subcontractor_project_assignments);

SELECT * FROM _st_reset_before
UNION ALL
SELECT * FROM _st_reset_after
ORDER BY objet, phase;

-- Contrôles PASS attendus
SELECT
  CASE WHEN (SELECT n FROM _st_reset_after WHERE objet = 'situations') = 0
        AND (SELECT n FROM _st_reset_after WHERE objet = 'avances') = 0
        AND (SELECT n FROM _st_reset_after WHERE objet = 'imputations') = 0
        AND (SELECT n FROM _st_reset_after WHERE objet = 'payments') = 0
        AND (SELECT n FROM _st_reset_after WHERE objet = 'events') = 0
        AND (SELECT n FROM _st_reset_after WHERE objet = 'retenues') = 0
       THEN 'PASS — volumes opérationnels à 0'
       ELSE 'FAIL — il reste des lignes'
  END AS controle_reset,
  CASE WHEN (SELECT n FROM _st_reset_after WHERE objet = 'profils')
            = (SELECT n FROM _st_reset_before WHERE objet = 'profils')
        AND (SELECT n FROM _st_reset_after WHERE objet = 'assignments')
            = (SELECT n FROM _st_reset_before WHERE objet = 'assignments')
       THEN 'PASS — profils & affectations conservés'
       ELSE 'FAIL — profils ou affectations modifiés'
  END AS controle_conservation;

-- Écritures caisse TOUJOURS présentes (non touchées) — à traiter à part
SELECT
  'finance_ST_encore_presentes' AS note,
  source_type,
  COUNT(*)::bigint AS n
FROM public.finance_transactions
WHERE source_type IN ('subcontractor_payment', 'subcontractor_advance')
  AND statut IS DISTINCT FROM 'Annulé'
GROUP BY source_type;

-- =============================================================================
-- FIN DE TRANSACTION
-- Par défaut : ROLLBACK (simulation sans appliquer)
-- Après votre validation explicite :
--   1) commenter la ligne ROLLBACK
--   2) décommenter COMMIT
-- =============================================================================

ROLLBACK;
-- COMMIT;
