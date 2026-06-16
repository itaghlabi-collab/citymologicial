-- =============================================================================
-- CITYMO — Réconciliation RH ↔ feuille de caisse (v2 — paiement consolidé)
-- Supabase → SQL Editor → Run (après RUN_FINANCE_TOUT_EN_UN.sql)
-- Puis dans l'app : Feuille de caisse → Actualiser
-- =============================================================================

-- 1) Supprimer TOUTES les anciennes lignes hebdomadaires (bug : une ligne / semaine)
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_weekly_payment';

-- 2) Supprimer les lignes consolidées si le groupe n'est pas entièrement Payé
DELETE FROM public.finance_transactions t
WHERE t.source_type = 'worker_payment'
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

-- 3) Supprimer les transactions auto dont la source sous-traitant n'est plus payée
DELETE FROM public.finance_transactions t
USING public.subcontractor_payments sp
WHERE t.source_type = 'subcontractor_payment'
  AND t.source_id = sp.id
  AND sp.status <> 'paid';

DELETE FROM public.finance_transactions
WHERE source_type IN ('worker_weekly_payment', 'subcontractor_payment')
  AND statut = 'Annulé';

-- Catégories requises
INSERT INTO public.finance_categories (nom, description, statut)
SELECT 'Main d''œuvre', 'Paiements ouvriers hebdomadaires', 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories
  WHERE lower(trim(nom)) IN ('main d''œuvre', 'main d oeuvre')
);

INSERT INTO public.finance_categories (nom, description, statut)
SELECT 'Sous-traitance', 'Paiements sous-traitants', 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories
  WHERE lower(trim(nom)) IN ('sous-traitance', 'sous traitance')
);

-- ── Sous-traitants payés → sorties caisse (inchangé) ─────────────────────────
INSERT INTO public.finance_transactions (
  date_operation, sens, type_operation, contrepartie, description, montant,
  mode_paiement, category_id, project_id, ref_operation,
  source_type, source_id, source_module, is_auto_generated, validation_status, statut, synced_at
)
SELECT
  COALESCE(sp.payment_date, CURRENT_DATE),
  'sortie',
  'autre_sortie',
  COALESCE(NULLIF(trim(s.raison_sociale), ''), NULLIF(trim(s.prenom || ' ' || s.nom), ''), 'Sous-traitant'),
  COALESCE(sp.description, sp.designation, 'Paiement sous-traitant — ' || COALESCE(pr.nom, '')),
  sp.amount,
  CASE lower(COALESCE(sp.payment_method, 'espèces'))
    WHEN 'virement' THEN 'Virement'
    WHEN 'chèque' THEN 'Chèque'
    WHEN 'carte' THEN 'Carte bancaire'
    ELSE 'Espèces'
  END,
  (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) IN ('sous-traitance', 'sous traitance') LIMIT 1),
  sp.project_id,
  sp.reference,
  'subcontractor_payment',
  sp.id,
  'rh',
  true,
  'pending',
  'Validé',
  now()
FROM public.subcontractor_payments sp
LEFT JOIN public.subcontractors s ON s.id = sp.subcontractor_id
LEFT JOIN public.projects pr ON pr.id = sp.project_id
WHERE sp.status = 'paid'
  AND COALESCE(sp.amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.finance_transactions t
    WHERE t.source_type = 'subcontractor_payment' AND t.source_id = sp.id AND t.statut <> 'Annulé'
  );

-- Ouvriers : la création des lignes worker_payment se fait via l'app (Actualiser)
-- pour garantir le même source_id UUID que le code JavaScript.

SELECT source_type, COUNT(*)::text AS nb, COALESCE(SUM(montant), 0)::text AS total_mad
FROM public.finance_transactions
WHERE source_type IN ('worker_payment', 'worker_weekly_payment', 'subcontractor_payment')
  AND statut <> 'Annulé'
GROUP BY source_type;

SELECT 'RUN_FINANCE_RH_BACKFILL OK — ouvriers : utilisez Actualiser dans Feuille de caisse' AS status;
