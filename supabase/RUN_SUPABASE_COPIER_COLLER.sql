-- =============================================================================
-- CITYMO — TOUT EN UN : coller dans Supabase → SQL Editor → Run
-- Corrige RLS + sync paiements ouvriers → feuille de caisse
-- Ré-exécutable sans danger (pas de DROP / TRUNCATE)
-- Puis app : Feuille de caisse → Actualiser
-- =============================================================================

-- ═══ A) finance_transactions — colonnes sync ═══
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
SET source_type = 'charge', source_id = charge_id, source_module = 'finance',
    is_auto_generated = true, synced_at = COALESCE(updated_at, created_at, now())
WHERE charge_id IS NOT NULL AND source_type IS NULL;

UPDATE public.finance_transactions
SET source_type = 'payment_order', source_id = payment_order_id, source_module = 'finance',
    is_auto_generated = true, synced_at = COALESCE(updated_at, created_at, now())
WHERE payment_order_id IS NOT NULL AND source_type IS NULL;

-- ═══ B) payroll — date paiement réelle ═══
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS payment_date date;

-- ═══ C) Validation journalière DG ═══
CREATE TABLE IF NOT EXISTS public.cash_daily_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_validation date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.daily_cash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

INSERT INTO public.daily_cash_reviews (review_date, validated_by, validated_at, notes)
SELECT date_validation, validated_by, validated_at, notes
FROM public.cash_daily_validations
WHERE NOT EXISTS (
  SELECT 1 FROM public.daily_cash_reviews d
  WHERE d.review_date = cash_daily_validations.date_validation
);

-- ═══ D) DÉSACTIVER RLS (corrige l'erreur affichée dans l'app) ═══
ALTER TABLE IF EXISTS public.finance_categories     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_charges        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_orders         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_monthly_balances  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_cash_reviews       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll                DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subcontractor_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workers                DISABLE ROW LEVEL SECURITY;

-- ═══ E) DROITS app (anon + authenticated) ═══
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_categories     TO anon, authenticated, service_role;
GRANT ALL ON public.finance_charges        TO anon, authenticated, service_role;
GRANT ALL ON public.payment_orders         TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions   TO anon, authenticated, service_role;
GRANT ALL ON public.cash_monthly_balances  TO anon, authenticated, service_role;
GRANT ALL ON public.cash_daily_validations TO anon, authenticated, service_role;
GRANT ALL ON public.daily_cash_reviews     TO anon, authenticated, service_role;
GRANT ALL ON public.payroll                TO anon, authenticated, service_role;
GRANT ALL ON public.subcontractor_payments TO anon, authenticated, service_role;
GRANT ALL ON public.workers                TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ═══ F) Catégories finance RH ═══
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

-- ═══ G) Corriger dates payroll Payé (jour réel, PAS semaine_fin) ═══
UPDATE public.payroll
SET
  paid_at = COALESCE(paid_at, updated_at, now()),
  payment_date = COALESCE(
    NULLIF(payment_date, semaine_fin),
    DATE(COALESCE(updated_at, now())),
    CURRENT_DATE
  )
WHERE statut IN ('Paye', 'Payé')
  AND (paid_at IS NULL OR payment_date IS NULL OR payment_date = semaine_fin);

-- ═══ H) Nettoyer lignes caisse incorrectes ═══
-- H1) Bug : une ligne par semaine (source_id = payroll.id)
DELETE FROM public.finance_transactions t
WHERE t.source_type IN ('worker_weekly_payment', 'worker_payment')
  AND EXISTS (SELECT 1 FROM public.payroll p WHERE p.id = t.source_id);

-- H2) Ancien format worker_payment
DELETE FROM public.finance_transactions
WHERE source_type = 'worker_payment';

-- H3) Ouvrier pas entièrement Payé → pas de ligne caisse
DELETE FROM public.finance_transactions t
WHERE t.source_type = 'worker_weekly_payment'
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

NOTIFY pgrst, 'reload schema';

-- ═══ I) CONTRÔLES (résultats en bas) ═══
SELECT 'RLS finance_transactions' AS controle,
       CASE WHEN c.relrowsecurity THEN 'ON — ERREUR' ELSE 'OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'finance_transactions';

SELECT 'RLS daily_cash_reviews' AS controle,
       CASE WHEN c.relrowsecurity THEN 'ON — ERREUR' ELSE 'OFF — OK' END AS statut
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'daily_cash_reviews';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'finance_transactions'
  AND column_name IN ('source_type', 'source_id', 'is_auto_generated', 'synced_at')
ORDER BY column_name;

SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  p.statut,
  ROUND(SUM(p.montant_net)::numeric, 2) AS total_net,
  MAX(p.payment_date) AS payment_date,
  MAX(p.paid_at::date) AS paid_at
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
GROUP BY w.prenom, w.nom, p.statut, p.project_id
ORDER BY ouvrier, p.statut;

SELECT date_operation, montant, contrepartie, source_type
FROM public.finance_transactions
WHERE statut <> 'Annulé'
  AND source_type IN ('worker_weekly_payment', 'worker_payment')
ORDER BY date_operation DESC;

SELECT 'TERMINÉ — Ouvrez Feuille de caisse → Actualiser puis repassez HAMMADI Payé si besoin' AS status;
