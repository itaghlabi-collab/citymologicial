-- =============================================================================
-- CITYMO — Correction sync paiements ouvriers → feuille de caisse
-- Règle : UNE ligne caisse par ouvrier × projet, uniquement si TOUTES les
-- semaines payroll sont Payé. Montant = somme montant_net.
--
-- 1) Exécuter ce script dans Supabase SQL Editor
-- 2) Dans l'app : Feuille de caisse → « Actualiser » (backfill RH)
-- =============================================================================

-- Supprimer les anciennes lignes hebdomadaires (bug : une ligne par semaine)
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_weekly_payment';

-- Supprimer les lignes consolidées si le groupe n'est pas entièrement Payé
DELETE FROM public.finance_transactions t
WHERE t.source_type = 'worker_payment'
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

-- Contrôle global
SELECT source_type, COUNT(*)::text AS nb, COALESCE(SUM(montant), 0)::text AS total_mad
FROM public.finance_transactions
WHERE source_type IN ('worker_payment', 'worker_weekly_payment')
  AND statut <> 'Annulé'
GROUP BY source_type;

-- Détail payroll par ouvrier (montant affiché dans Paiement hebdo)
SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  p.chantier AS projet,
  p.semaine_debut,
  p.semaine_fin,
  p.montant_net,
  p.statut
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
ORDER BY ouvrier, p.semaine_debut;

-- Résumé attendu caisse (une ligne si tout Payé, zéro si une semaine En attente)
SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  p.project_id,
  COUNT(*) FILTER (WHERE p.statut IN ('Paye', 'Payé')) AS semaines_payees,
  COUNT(*) FILTER (WHERE p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')) AS semaines_non_payees,
  ROUND(SUM(CASE WHEN p.statut IN ('Paye', 'Payé') THEN p.montant_net ELSE 0 END)::numeric, 2) AS total_si_tout_paye,
  BOOL_AND(p.statut IN ('Paye', 'Payé') OR p.statut IN ('Annule', 'Annulé')) AS sync_caisse_autorise
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
GROUP BY w.id, w.prenom, w.nom, p.project_id
ORDER BY ouvrier;

-- Lignes caisse actuelles pour ces ouvriers
SELECT t.date_operation, t.montant, t.contrepartie, t.source_type, t.description
FROM public.finance_transactions t
WHERE t.worker_id IN (
  SELECT w.id FROM public.workers w
  WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
)
AND t.statut <> 'Annulé'
ORDER BY t.date_operation DESC, t.montant DESC;
