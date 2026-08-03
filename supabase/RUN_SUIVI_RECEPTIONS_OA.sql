-- CITYMO — Suivi des récupérations par Ordre d'achat
-- Visibilité uniquement.
-- Script additif et réexécutable.
-- Ne modifie pas les BC, le stock ou la finance.

CREATE TABLE IF NOT EXISTS public.purchase_acquisition_order_retrievals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  acquisition_order_id UUID NOT NULL
    REFERENCES public.purchase_acquisition_orders(id)
    ON DELETE RESTRICT,

  line_id TEXT NOT NULL,

  -- Champ technique :
  -- 0 = non récupéré
  -- quantité commandée = récupéré
  qty_retrieved NUMERIC(14, 3) NOT NULL DEFAULT 0,

  retrieved_at DATE,
  retrieved_by TEXT,
  observation TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT purchase_acquisition_order_retrievals_qty_nonneg
    CHECK (qty_retrieved >= 0),

  CONSTRAINT purchase_acquisition_order_retrievals_unique_line
    UNIQUE (acquisition_order_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_pao_retrievals_order
  ON public.purchase_acquisition_order_retrievals (acquisition_order_id);

CREATE INDEX IF NOT EXISTS idx_pao_retrievals_updated
  ON public.purchase_acquisition_order_retrievals (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_acquisition_order_retrievals_updated_at
  ON public.purchase_acquisition_order_retrievals;

CREATE TRIGGER purchase_acquisition_order_retrievals_updated_at
  BEFORE UPDATE ON public.purchase_acquisition_order_retrievals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_acquisition_order_retrievals
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_acquisition_order_retrievals_all_auth
  ON public.purchase_acquisition_order_retrievals;

CREATE POLICY purchase_acquisition_order_retrievals_all_auth
  ON public.purchase_acquisition_order_retrievals
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.purchase_acquisition_order_retrievals
  TO authenticated;

GRANT ALL
  ON public.purchase_acquisition_order_retrievals
  TO service_role;

NOTIFY pgrst, 'reload schema';
