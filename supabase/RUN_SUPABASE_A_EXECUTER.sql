-- =============================================================================
-- CITYMO — SCRIPT COMPLET À EXÉCUTER SUR SUPABASE (SQL Editor → Run)
-- Ré-exécutable sans danger. Ordre : schéma → nettoyage → contrôle.
-- Puis dans l'app : Feuille de caisse → « Actualiser »
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — Schéma finance (colonnes sync, validation DG, RLS, catégories)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS is_auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_source_unique
  ON public.finance_transactions (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

UPDATE public.finance_transactions
SET
  source_type = 'charge',
  source_id = charge_id,
  source_module = 'finance',
  is_auto_generated = true,
  synced_at = COALESCE(updated_at, created_at, now())
WHERE charge_id IS NOT NULL AND source_type IS NULL;

UPDATE public.finance_transactions
SET
  source_type = 'payment_order',
  source_id = payment_order_id,
  source_module = 'finance',
  is_auto_generated = true,
  synced_at = COALESCE(updated_at, created_at, now())
WHERE payment_order_id IS NOT NULL AND source_type IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS cash_daily_validations_date_idx
  ON public.cash_daily_validations (date_validation DESC);

CREATE TABLE IF NOT EXISTS public.daily_cash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS daily_cash_reviews_date_idx
  ON public.daily_cash_reviews (review_date DESC);

INSERT INTO public.daily_cash_reviews (review_date, validated_by, validated_at, notes)
SELECT date_validation, validated_by, validated_at, notes
FROM public.cash_daily_validations
WHERE NOT EXISTS (
  SELECT 1 FROM public.daily_cash_reviews d WHERE d.review_date = cash_daily_validations.date_validation
);

ALTER TABLE IF EXISTS public.finance_categories     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_charges        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_orders         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_monthly_balances  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_cash_reviews     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll                DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subcontractor_payments DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_categories     TO anon, authenticated, service_role;
GRANT ALL ON public.finance_charges        TO anon, authenticated, service_role;
GRANT ALL ON public.payment_orders         TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions   TO anon, authenticated, service_role;
GRANT ALL ON public.cash_monthly_balances  TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;
GRANT ALL ON public.daily_cash_reviews     TO anon, authenticated, service_role;

INSERT INTO public.finance_categories (nom, description, statut)
SELECT 'Main d''œuvre', 'Paiements ouvriers hebdomadaires', 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories
  WHERE lower(trim(nom)) IN ('main d''œuvre', 'main d oeuvre', 'main-d''oeuvre')
);

INSERT INTO public.finance_categories (nom, description, statut)
SELECT 'Sous-traitance', 'Paiements sous-traitants', 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories
  WHERE lower(trim(nom)) IN ('sous-traitance', 'sous traitance')
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — Correction sync ouvriers (supprimer lignes hebdo incorrectes)
-- Règle : 1 ligne caisse / ouvrier×projet, uniquement si TOUT est Payé
-- ═══════════════════════════════════════════════════════════════════════════

-- Bug : une ligne par semaine (worker_weekly_payment) → SUPPRIMER
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_weekly_payment';

-- Lignes consolidées invalides (ouvrier pas entièrement Payé)
DELETE FROM public.finance_transactions t
WHERE t.source_type = 'worker_payment'
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

-- Sous-traitants : retirer lignes dont le paiement n'est plus paid
DELETE FROM public.finance_transactions t
USING public.subcontractor_payments sp
WHERE t.source_type = 'subcontractor_payment'
  AND t.source_id = sp.id
  AND sp.status <> 'paid';

DELETE FROM public.finance_transactions
WHERE source_type IN ('worker_weekly_payment', 'subcontractor_payment')
  AND statut = 'Annulé';

-- Réaligner payment_date sur fin de semaine pour payroll Payé
UPDATE public.payroll
SET payment_date = COALESCE(semaine_fin, semaine_debut)
WHERE statut IN ('Paye', 'Payé')
  AND semaine_fin IS NOT NULL
  AND (payment_date IS NULL OR payment_date > semaine_fin);

-- Backfill sous-traitants payés (ouvriers = via app « Actualiser »)
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

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — Contrôles (résultats attendus en bas)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'finance_transactions'
  AND column_name IN ('source_type', 'source_id', 'is_auto_generated')
ORDER BY column_name;

SELECT c.relname AS table_name,
       CASE WHEN c.relrowsecurity THEN 'RLS ON — BLOQUE' ELSE 'RLS OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('finance_transactions', 'payroll', 'subcontractor_payments')
ORDER BY 1;

SELECT source_type, COUNT(*)::text AS nb, COALESCE(SUM(montant), 0)::text AS total_mad
FROM public.finance_transactions
WHERE source_type IN ('worker_payment', 'worker_weekly_payment', 'subcontractor_payment')
  AND statut <> 'Annulé'
GROUP BY source_type;

SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  COUNT(*) FILTER (WHERE p.statut IN ('Paye', 'Payé')) AS semaines_payees,
  COUNT(*) FILTER (WHERE p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')) AS semaines_en_attente,
  ROUND(SUM(p.montant_net)::numeric, 2) AS total_net,
  BOOL_AND(p.statut IN ('Paye', 'Payé') OR p.statut IN ('Annule', 'Annulé')) AS caisse_autorisee
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
GROUP BY w.id, w.prenom, w.nom, p.project_id
HAVING TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
ORDER BY ouvrier;

SELECT 'OK — Ouvrez Feuille de caisse → Actualiser pour recréer les lignes worker_payment' AS status;
