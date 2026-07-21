-- CITYMO — Notation fournisseurs : Rapport qualité / prix (étoiles 1–5)
-- Additive / idempotent — ne casse pas les fournisseurs existants.
-- Coller dans Supabase → SQL Editor → Run.

ALTER TABLE public.purchase_suppliers
  ADD COLUMN IF NOT EXISTS rating_quality_price SMALLINT;

ALTER TABLE public.purchase_suppliers
  ADD COLUMN IF NOT EXISTS rating_comment TEXT;

-- Contrainte 1..5 (nullable = non noté)
DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_suppliers_rating_quality_price_check'
      AND conrelid = 'public.purchase_suppliers'::regclass
  ) THEN
    ALTER TABLE public.purchase_suppliers
      ADD CONSTRAINT purchase_suppliers_rating_quality_price_check
      CHECK (
        rating_quality_price IS NULL
        OR (rating_quality_price >= 1 AND rating_quality_price <= 5)
      );
  END IF;
END $ck$;

CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_rating_qp
  ON public.purchase_suppliers (rating_quality_price DESC NULLS LAST)
  WHERE rating_quality_price IS NOT NULL;

SELECT 'rating_quality_price (étoiles qualité/prix) OK' AS status;
