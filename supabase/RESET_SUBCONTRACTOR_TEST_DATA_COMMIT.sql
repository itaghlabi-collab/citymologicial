-- =============================================================================
-- CITYMO — RESET IMMÉDIAT Situation sous-traitants (AVEC COMMIT)
-- Supabase → SQL Editor → coller TOUT → Run
--
-- Efface : situations, avances, imputations, retenues, évaluations,
--          historiques compte, paiements ST, adjustments
-- Conserve : profils sous-traitants, affectations, documents, projets, caisse
-- =============================================================================

BEGIN;

DELETE FROM public.subcontractor_advance_imputations;
DELETE FROM public.subcontractor_account_events;
DELETE FROM public.subcontractor_retenues;
DELETE FROM public.subcontractor_evaluations;

UPDATE public.subcontractor_payments
SET situation_id = NULL
WHERE situation_id IS NOT NULL;

DELETE FROM public.subcontractor_situations;
DELETE FROM public.subcontractor_global_advances;
DELETE FROM public.subcontractor_project_adjustments;
DELETE FROM public.subcontractor_payments;

COMMIT;

-- Vérification (doit être 0 partout sauf profils)
SELECT 'situations' AS objet, COUNT(*)::text AS n FROM public.subcontractor_situations
UNION ALL SELECT 'avances', COUNT(*)::text FROM public.subcontractor_global_advances
UNION ALL SELECT 'imputations', COUNT(*)::text FROM public.subcontractor_advance_imputations
UNION ALL SELECT 'events', COUNT(*)::text FROM public.subcontractor_account_events
UNION ALL SELECT 'retenues', COUNT(*)::text FROM public.subcontractor_retenues
UNION ALL SELECT 'evaluations', COUNT(*)::text FROM public.subcontractor_evaluations
UNION ALL SELECT 'payments', COUNT(*)::text FROM public.subcontractor_payments
UNION ALL SELECT 'adjustments', COUNT(*)::text FROM public.subcontractor_project_adjustments
UNION ALL SELECT 'profils (conservés)', COUNT(*)::text FROM public.subcontractors
UNION ALL SELECT 'affectations (conservées)', COUNT(*)::text FROM public.subcontractor_project_assignments;

NOTIFY pgrst, 'reload schema';
