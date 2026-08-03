-- CITYMO — Suivi des réceptions (visibilité uniquement)
-- Table dédiée : ne modifie PAS purchase_orders, stock, finance, ni workflows.
-- Exécuter une fois dans Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.purchase_order_retrievals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL,
  qty_retrieved NUMERIC(14, 3) NOT NULL DEFAULT 0,
  retrieved_at DATE,
  retrieved_by TEXT,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_retrievals_qty_nonneg CHECK (qty_retrieved >= 0),
  CONSTRAINT purchase_order_retrievals_unique_line UNIQUE (purchase_order_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_po_retrievals_order
  ON public.purchase_order_retrievals (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_po_retrievals_updated
  ON public.purchase_order_retrievals (updated_at DESC);

DROP TRIGGER IF EXISTS purchase_order_retrievals_updated_at ON public.purchase_order_retrievals;
CREATE TRIGGER purchase_order_retrievals_updated_at
  BEFORE UPDATE ON public.purchase_order_retrievals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_order_retrievals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_order_retrievals_all_auth ON public.purchase_order_retrievals;
CREATE POLICY purchase_order_retrievals_all_auth ON public.purchase_order_retrievals
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.purchase_order_retrievals TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
