-- =============================================================================
-- CITYMO — AUDIT reset Situation sous-traitants (LECTURE SEULE)
-- Supabase SQL Editor → Run
-- Aucune suppression — fournit les volumes avant reset
-- =============================================================================

-- ─── 1. Volumes module Situation ─────────────────────────────────────────────
SELECT 'subcontractors (profils — À CONSERVER)' AS objet,
  COUNT(*)::bigint AS n FROM public.subcontractors
UNION ALL
SELECT 'subcontractor_project_assignments (À CONSERVER)',
  COUNT(*)::bigint FROM public.subcontractor_project_assignments
UNION ALL
SELECT 'subcontractor_documents (À CONSERVER)',
  COUNT(*)::bigint FROM public.subcontractor_documents
UNION ALL
SELECT 'subcontractor_situations',
  COUNT(*)::bigint FROM public.subcontractor_situations
UNION ALL
SELECT 'subcontractor_situations (is_historical)',
  COUNT(*)::bigint FROM public.subcontractor_situations WHERE is_historical = TRUE
UNION ALL
SELECT 'subcontractor_global_advances',
  COUNT(*)::bigint FROM public.subcontractor_global_advances
UNION ALL
SELECT 'subcontractor_advance_imputations',
  COUNT(*)::bigint FROM public.subcontractor_advance_imputations
UNION ALL
SELECT 'subcontractor_account_events',
  COUNT(*)::bigint FROM public.subcontractor_account_events
UNION ALL
SELECT 'subcontractor_retenues',
  COUNT(*)::bigint FROM public.subcontractor_retenues
UNION ALL
SELECT 'subcontractor_evaluations',
  COUNT(*)::bigint FROM public.subcontractor_evaluations
UNION ALL
SELECT 'subcontractor_payments (TOUS)',
  COUNT(*)::bigint FROM public.subcontractor_payments
UNION ALL
SELECT 'subcontractor_payments (liés situation_id)',
  COUNT(*)::bigint FROM public.subcontractor_payments WHERE situation_id IS NOT NULL
UNION ALL
SELECT 'subcontractor_payments (sans projet)',
  COUNT(*)::bigint FROM public.subcontractor_payments WHERE project_id IS NULL
UNION ALL
SELECT 'subcontractor_project_adjustments',
  COUNT(*)::bigint FROM public.subcontractor_project_adjustments
UNION ALL
SELECT 'subcontractor_services (prestations — hors reset par défaut)',
  COUNT(*)::bigint FROM public.subcontractor_services
ORDER BY 1;

-- ─── 2. Écritures financières LIÉES (NE PAS SUPPRIMER dans le reset) ─────────
-- À traiter manuellement / séparément si besoin d’annuler la caisse
SELECT
  'finance_transactions' AS table_name,
  source_type,
  COUNT(*)::bigint AS n,
  COALESCE(SUM(montant), 0)::numeric(14, 2) AS total_montant,
  COUNT(*) FILTER (WHERE statut IS DISTINCT FROM 'Annulé')::bigint AS actifs
FROM public.finance_transactions
WHERE source_type IN ('subcontractor_payment', 'subcontractor_advance')
GROUP BY source_type
ORDER BY source_type;

-- Détail (échantillon) des écritures caisse liées
SELECT
  id,
  date_operation,
  montant,
  contrepartie,
  source_type,
  source_id,
  statut,
  ref_operation
FROM public.finance_transactions
WHERE source_type IN ('subcontractor_payment', 'subcontractor_advance')
ORDER BY date_operation DESC NULLS LAST
LIMIT 50;

-- ─── 3. Aperçu par sous-traitant (top activité) ───────────────────────────────
SELECT
  s.id,
  COALESCE(NULLIF(TRIM(s.raison_sociale), ''), TRIM(COALESCE(s.prenom, '') || ' ' || COALESCE(s.nom, ''))) AS nom,
  (SELECT COUNT(*) FROM public.subcontractor_payments p WHERE p.subcontractor_id = s.id) AS nb_paiements,
  (SELECT COUNT(*) FROM public.subcontractor_situations x WHERE x.subcontractor_id = s.id) AS nb_situations,
  (SELECT COUNT(*) FROM public.subcontractor_global_advances a WHERE a.subcontractor_id = s.id) AS nb_avances,
  (SELECT COALESCE(SUM(a.amount), 0) FROM public.subcontractor_global_advances a
     WHERE a.subcontractor_id = s.id AND a.status IS DISTINCT FROM 'cancelled') AS avances_versees
FROM public.subcontractors s
WHERE EXISTS (
  SELECT 1 FROM public.subcontractor_payments p WHERE p.subcontractor_id = s.id
  UNION ALL
  SELECT 1 FROM public.subcontractor_situations x WHERE x.subcontractor_id = s.id
  UNION ALL
  SELECT 1 FROM public.subcontractor_global_advances a WHERE a.subcontractor_id = s.id
)
ORDER BY nb_paiements DESC, nb_situations DESC
LIMIT 30;
