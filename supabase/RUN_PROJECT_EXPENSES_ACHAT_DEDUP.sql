-- Dépenses par projet — une seule ligne par demande d'achat (origine = achat)
-- À exécuter dans Supabase SQL Editor

ALTER TABLE public.project_expenses
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_acquisition_order_id UUID REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS montant_paye NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS date_paiement DATE;

ALTER TABLE public.project_expenses DROP CONSTRAINT IF EXISTS project_expenses_statut_check;
ALTER TABLE public.project_expenses ADD CONSTRAINT project_expenses_statut_check
  CHECK (statut IN ('valide', 'annule', 'en_attente', 'engagee', 'payee'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_purchase_request_unique
  ON public.project_expenses (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_expenses_purchase_oa
  ON public.project_expenses (purchase_acquisition_order_id)
  WHERE purchase_acquisition_order_id IS NOT NULL;

-- Rattacher les dépenses achat existantes (source purchase_request)
UPDATE public.project_expenses pe
SET purchase_request_id = pe.source_id
WHERE pe.source_type = 'purchase_request'
  AND pe.source_id IS NOT NULL
  AND pe.purchase_request_id IS NULL;

-- Fusionner doublons OP → ligne Achat canonique
WITH op_exp AS (
  SELECT pe.id AS dup_id, pe.project_id, pe.montant, pe.fournisseur, pe.mode_paiement,
         po.id AS op_id, po.purchase_request_id, po.purchase_acquisition_order_id,
         po.montant AS op_montant, po.date_paiement, po.statut AS op_statut
  FROM public.project_expenses pe
  JOIN public.payment_orders po ON po.id = pe.source_id
  WHERE pe.origine = 'ordre_paiement'
    AND pe.source_type = 'payment_order'
    AND po.purchase_request_id IS NOT NULL
),
canon AS (
  SELECT DISTINCT ON (op_exp.purchase_request_id)
    op_exp.*,
    pe2.id AS canon_id
  FROM op_exp
  JOIN public.project_expenses pe2
    ON pe2.purchase_request_id = op_exp.purchase_request_id
    AND pe2.origine = 'achat'
  ORDER BY op_exp.purchase_request_id, pe2.created_at ASC
)
UPDATE public.project_expenses pe
SET
  payment_order_id = c.op_id,
  purchase_acquisition_order_id = COALESCE(pe.purchase_acquisition_order_id, c.purchase_acquisition_order_id),
  montant_paye = CASE WHEN c.op_statut IN ('Payé', 'Validé', 'Comptabilisé', 'Exécuté')
    THEN COALESCE(pe.montant_paye, c.op_montant) ELSE pe.montant_paye END,
  date_paiement = COALESCE(pe.date_paiement, c.date_paiement),
  statut = CASE WHEN c.op_statut IN ('Payé', 'Validé', 'Comptabilisé', 'Exécuté') THEN 'payee'
    WHEN pe.statut IN ('payee', 'engagee') THEN pe.statut ELSE 'engagee' END,
  mode_paiement = COALESCE(pe.mode_paiement, c.mode_paiement),
  montant = GREATEST(COALESCE(pe.montant, 0), COALESCE(c.op_montant, 0), COALESCE(c.montant, 0))
FROM canon c
WHERE pe.id = c.canon_id;

DELETE FROM public.project_expenses pe
WHERE pe.origine = 'ordre_paiement'
  AND pe.source_type = 'payment_order'
  AND EXISTS (
    SELECT 1 FROM public.payment_orders po
    WHERE po.id = pe.source_id
      AND po.purchase_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.project_expenses pe2
        WHERE pe2.purchase_request_id = po.purchase_request_id
          AND pe2.origine = 'achat'
      )
  );

-- Supprimer doublons OA si ligne DA existe
DELETE FROM public.project_expenses pe
WHERE pe.source_type = 'purchase_acquisition_order'
  AND EXISTS (
    SELECT 1 FROM public.purchase_acquisition_orders oa
    JOIN public.project_expenses pe2
      ON pe2.purchase_request_id = oa.purchase_request_id
      AND pe2.origine = 'achat'
    WHERE oa.id = pe.source_id
  );
