-- =============================================================================
-- CITYMO — RÉPARATION RAPIDE (sans suppressions destructives)
-- À utiliser si RUN_SUPABASE_A_EXECUTER.sql a vidé la caisse.
-- Supabase → SQL Editor → Run → app : Feuille de caisse → Actualiser
-- =============================================================================

-- 1) RLS OFF + droits
ALTER TABLE IF EXISTS public.finance_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_cash_reviews     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_daily_validations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll                DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.finance_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.daily_cash_reviews     TO anon, authenticated, service_role;
GRANT ALL ON public.payroll                TO anon, authenticated, service_role;

-- Policies permissives (si RLS réactivé par erreur)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_cash_reviews' AND policyname = 'citymo_cash_reviews_all'
  ) THEN
    CREATE POLICY citymo_cash_reviews_all ON public.daily_cash_reviews
      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_transactions' AND policyname = 'citymo_finance_tx_all'
  ) THEN
    CREATE POLICY citymo_finance_tx_all ON public.finance_transactions
      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.citymo_worker_payment_source_id(p_worker uuid, p_project uuid)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE seed text; b bytea; hex text;
BEGIN
  seed := 'citymo:worker_weekly_payment:' || p_worker::text || ':' || COALESCE(p_project::text, 'none');
  b := substring(digest(seed, 'sha256') FROM 1 FOR 16);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 64);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  hex := encode(b, 'hex');
  RETURN (substr(hex,1,8)||'-'||substr(hex,9,4)||'-'||substr(hex,13,4)||'-'||substr(hex,17,4)||'-'||substr(hex,21,12))::uuid;
END;
$$;

-- 2) Recréer lignes ouvriers Payé (brouillons auto En attente ignorés)
WITH payroll_active AS (
  SELECT * FROM public.payroll
  WHERE worker_id IS NOT NULL AND statut NOT IN ('Annule', 'Annulé')
),
groups AS (
  SELECT
    p.worker_id,
    p.project_id,
    ROUND(SUM(CASE WHEN p.statut IN ('Paye', 'Payé') THEN COALESCE(p.montant_net, 0) ELSE 0 END)::numeric, 2) AS total_net,
    MAX(CASE WHEN p.statut IN ('Paye', 'Payé') THEN COALESCE(
      DATE(p.paid_at), NULLIF(p.payment_date, p.semaine_fin), DATE(p.updated_at), CURRENT_DATE
    ) END) AS pay_date,
    BOOL_OR(
      p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
      AND NOT (COALESCE(p.auto_generated, false) = true AND p.statut = 'En attente')
    ) AS has_blocking_unpaid,
    MAX(NULLIF(trim(p.chantier), '')) AS chantier
  FROM payroll_active p
  GROUP BY p.worker_id, p.project_id
),
eligible AS (
  SELECT g.*,
    TRIM(w.prenom || ' ' || w.nom) AS ouvrier_nom,
    COALESCE(g.chantier, pr.nom, 'Chantier') AS projet_nom,
    public.citymo_worker_payment_source_id(g.worker_id, g.project_id) AS source_id
  FROM groups g
  JOIN public.workers w ON w.id = g.worker_id
  LEFT JOIN public.projects pr ON pr.id = g.project_id
  WHERE g.total_net > 0 AND NOT g.has_blocking_unpaid
),
updated AS (
  UPDATE public.finance_transactions ft SET
    date_operation = e.pay_date, montant = e.total_net, contrepartie = e.ouvrier_nom,
    description = 'Paiement ouvrier — ' || e.projet_nom,
    project_id = e.project_id, worker_id = e.worker_id, synced_at = now(), statut = 'Validé'
  FROM eligible e
  WHERE ft.source_type = 'worker_weekly_payment' AND ft.source_id = e.source_id
  RETURNING ft.id
)
INSERT INTO public.finance_transactions (
  date_operation, sens, type_operation, contrepartie, description, montant,
  mode_paiement, category_id, project_id, worker_id,
  source_type, source_id, source_module, is_auto_generated, validation_status, statut, synced_at
)
SELECT e.pay_date, 'sortie', 'autre_sortie', e.ouvrier_nom, 'Paiement ouvrier — ' || e.projet_nom,
  e.total_net, 'Espèces',
  (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) LIKE 'main d%' LIMIT 1),
  e.project_id, e.worker_id, 'worker_weekly_payment', e.source_id, 'rh', true, 'pending', 'Validé', now()
FROM eligible e
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_transactions ft
  WHERE ft.source_type = 'worker_weekly_payment' AND ft.source_id = e.source_id
);

NOTIFY pgrst, 'reload schema';

SELECT date_operation, montant, contrepartie, source_type
FROM public.finance_transactions
WHERE statut <> 'Annulé' AND source_type = 'worker_weekly_payment'
ORDER BY date_operation DESC;

SELECT 'RÉPARATION OK — Ctrl+F5 puis Actualiser dans Feuille de caisse' AS status;
