-- =============================================================================
-- CITYMO — Correction DÉFINITIVE sync paiements ouvriers → feuille de caisse
-- Supabase → SQL Editor → Run (ré-exécutable, sans DROP/TRUNCATE)
-- Puis app : Feuille de caisse → Actualiser
-- =============================================================================

-- 1) Colonnes payroll + finance (sans supprimer de données)
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

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

-- 2) Paiements Payé : paid_at / payment_date = jour réel (pas fin de semaine)
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

-- 3) Supprimer lignes caisse PAR SEMAINE (source_id = payroll.id) — bug multi-lignes
DELETE FROM public.finance_transactions t
WHERE t.source_type IN ('worker_weekly_payment', 'worker_payment')
  AND EXISTS (
    SELECT 1 FROM public.payroll p WHERE p.id = t.source_id
  );

-- 4) Supprimer lignes ouvrier si le groupe n'est pas entièrement Payé
DELETE FROM public.finance_transactions t
WHERE t.source_type IN ('worker_weekly_payment', 'worker_payment')
  AND t.worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.worker_id = t.worker_id
      AND COALESCE(p.project_id::text, '') = COALESCE(t.project_id::text, '')
      AND p.statut NOT IN ('Paye', 'Payé', 'Annule', 'Annulé')
  );

-- 5) RLS finance (sync app)
ALTER TABLE IF EXISTS public.finance_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payroll DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.finance_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.payroll TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 6) Contrôle HAMMADI / TADLAOUI
SELECT
  TRIM(w.prenom || ' ' || w.nom) AS ouvrier,
  p.statut,
  p.montant_net,
  p.payment_date,
  p.paid_at::date AS paid_at_date,
  p.semaine_debut,
  p.semaine_fin
FROM public.payroll p
JOIN public.workers w ON w.id = p.worker_id
WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
ORDER BY ouvrier, p.semaine_debut;

SELECT t.date_operation, t.montant, t.contrepartie, t.source_type, t.source_id
FROM public.finance_transactions t
WHERE t.worker_id IN (
  SELECT w.id FROM public.workers w
  WHERE TRIM(w.prenom || ' ' || w.nom) ILIKE ANY (ARRAY['%HAMMADI%', '%TADLAOUI%'])
)
AND t.statut <> 'Annulé'
ORDER BY t.date_operation DESC;

SELECT 'OK — Actualiser la Feuille de caisse dans l''app' AS status;
