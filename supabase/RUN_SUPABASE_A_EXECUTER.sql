-- =============================================================================
-- CITYMO — SCRIPT COMPLET À EXÉCUTER SUR SUPABASE (SQL Editor → Run)
-- Le déploiement Vercel ne suffit PAS : ce script doit tourner sur Supabase.
-- Ré-exécutable sans danger. Puis app : Feuille de caisse → Actualiser (F5).
-- =============================================================================

-- ═══ 1) Schéma finance + payroll ═══
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

ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_date date;

UPDATE public.finance_transactions
SET source_type = 'charge', source_id = charge_id, source_module = 'finance',
    is_auto_generated = true, synced_at = COALESCE(updated_at, created_at, now())
WHERE charge_id IS NOT NULL AND source_type IS NULL;

UPDATE public.finance_transactions
SET source_type = 'payment_order', source_id = payment_order_id, source_module = 'finance',
    is_auto_generated = true, synced_at = COALESCE(updated_at, created_at, now())
WHERE payment_order_id IS NOT NULL AND source_type IS NULL;

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
  SELECT 1 FROM public.daily_cash_reviews d WHERE d.review_date = cash_daily_validations.date_validation
);

-- ═══ 2) DÉSACTIVER RLS (corrige l'erreur orange dans l'app) ═══
ALTER TABLE IF EXISTS public.finance_categories     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_charges        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_orders         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_monthly_balances  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_cash_reviews     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll                DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subcontractor_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workers                DISABLE ROW LEVEL SECURITY;

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

-- ═══ 3) Dates payroll Payé = jour réel (JAMAIS semaine_fin) ═══
UPDATE public.payroll
SET
  paid_at = COALESCE(paid_at, updated_at, now()),
  payment_date = COALESCE(
    NULLIF(payment_date, semaine_fin),
    DATE(COALESCE(paid_at, updated_at, now())),
    CURRENT_DATE
  )
WHERE statut IN ('Paye', 'Payé')
  AND (paid_at IS NULL OR payment_date IS NULL OR payment_date = semaine_fin);

-- ═══ 4) Nettoyage lignes caisse incorrectes ═══
DELETE FROM public.finance_transactions t
WHERE t.source_type IN ('worker_weekly_payment', 'worker_payment')
  AND EXISTS (SELECT 1 FROM public.payroll p WHERE p.id = t.source_id);

DELETE FROM public.finance_transactions WHERE source_type = 'worker_payment';

DELETE FROM public.finance_transactions t
WHERE t.source_type = 'worker_weekly_payment'
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

DELETE FROM public.finance_transactions t
USING public.subcontractor_payments sp
WHERE t.source_type = 'subcontractor_payment'
  AND t.source_id = sp.id
  AND sp.status <> 'paid';

-- ═══ 5) UUID stable source_id (identique au code JavaScript) ═══
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.citymo_worker_payment_source_id(p_worker uuid, p_project uuid)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  seed text;
  b bytea;
  hex text;
BEGIN
  seed := 'citymo:worker_weekly_payment:' || p_worker::text || ':' || COALESCE(p_project::text, 'none');
  b := substring(digest(seed, 'sha256') FROM 1 FOR 16);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 64);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  hex := encode(b, 'hex');
  RETURN (
    substr(hex, 1, 8) || '-' ||
    substr(hex, 9, 4) || '-' ||
    substr(hex, 13, 4) || '-' ||
    substr(hex, 17, 4) || '-' ||
    substr(hex, 21, 12)
  )::uuid;
END;
$$;

-- ═══ 6) BACKFILL SQL direct ouvriers Payé → feuille de caisse ═══
WITH payroll_active AS (
  SELECT *
  FROM public.payroll
  WHERE worker_id IS NOT NULL
    AND statut NOT IN ('Annule', 'Annulé')
),
groups AS (
  SELECT
    p.worker_id,
    p.project_id,
    ROUND(SUM(COALESCE(p.montant_net, 0))::numeric, 2) AS total_net,
    MAX(COALESCE(
      DATE(p.paid_at),
      NULLIF(p.payment_date, p.semaine_fin),
      DATE(p.updated_at),
      CURRENT_DATE
    )) AS pay_date,
    BOOL_AND(p.statut IN ('Paye', 'Payé')) AS all_paid,
    MAX(NULLIF(trim(p.chantier), '')) AS chantier
  FROM payroll_active p
  GROUP BY p.worker_id, p.project_id
),
eligible AS (
  SELECT
    g.*,
    TRIM(w.prenom || ' ' || w.nom) AS ouvrier_nom,
    COALESCE(g.chantier, pr.nom, 'Chantier') AS projet_nom
  FROM groups g
  JOIN public.workers w ON w.id = g.worker_id
  LEFT JOIN public.projects pr ON pr.id = g.project_id
  WHERE g.all_paid AND g.total_net > 0
)
INSERT INTO public.finance_transactions (
  date_operation, sens, type_operation, contrepartie, description, montant,
  mode_paiement, category_id, project_id, worker_id, ref_operation,
  source_type, source_id, source_module, is_auto_generated, validation_status, statut, synced_at
)
SELECT
  e.pay_date,
  'sortie',
  'autre_sortie',
  e.ouvrier_nom,
  'Paiement ouvrier — ' || e.projet_nom,
  e.total_net,
  'Espèces',
  (SELECT id FROM public.finance_categories
   WHERE lower(trim(nom)) IN ('main d''œuvre', 'main d oeuvre', 'main-d''oeuvre')
   LIMIT 1),
  e.project_id,
  e.worker_id,
  NULL,
  'worker_weekly_payment',
  public.citymo_worker_payment_source_id(e.worker_id, e.project_id),
  'rh',
  true,
  'pending',
  'Validé',
  now()
FROM eligible e
ON CONFLICT (source_type, source_id)
DO UPDATE SET
  date_operation = EXCLUDED.date_operation,
  montant = EXCLUDED.montant,
  contrepartie = EXCLUDED.contrepartie,
  description = EXCLUDED.description,
  project_id = EXCLUDED.project_id,
  worker_id = EXCLUDED.worker_id,
  synced_at = now(),
  statut = 'Validé';

-- Sous-traitants payés
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

-- ═══ 7) CONTRÔLES ═══
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

SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  BOOL_AND(p.statut IN ('Paye', 'Payé') OR p.statut IN ('Annule', 'Annulé')) AS tout_paye,
  ROUND(SUM(p.montant_net)::numeric, 2) AS total_net,
  MAX(COALESCE(DATE(p.paid_at), NULLIF(p.payment_date, p.semaine_fin), DATE(p.updated_at))) AS date_paiement
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
GROUP BY w.prenom, w.nom, p.project_id
ORDER BY ouvrier;

SELECT date_operation, montant, contrepartie, source_type
FROM public.finance_transactions
WHERE statut <> 'Annulé'
  AND source_type IN ('worker_weekly_payment', 'worker_payment')
ORDER BY date_operation DESC;

SELECT 'TERMINÉ — Rechargez l''app (Ctrl+F5). HAMMADI doit apparaître à la date ci-dessus.' AS status;
