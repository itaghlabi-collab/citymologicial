-- =============================================================================
-- CITYMO — Achats : Bons de commande (purchase_orders)
-- Coller dans Supabase → SQL Editor → Run (une seule fois)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_bc          TEXT,
  supplier_id     UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name   TEXT,
  order_date      DATE,
  delivery_date   DATE,
  currency        TEXT NOT NULL DEFAULT 'MAD',
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'Brouillon',
  subtotal_ht     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_vat       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lines           JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS order_date DATE;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_date DATE;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MAD';

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_vat NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON public.purchase_orders (status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id
  ON public.purchase_orders (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON public.purchase_orders (created_at DESC);

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_select_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_select_auth ON public.purchase_orders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_orders_insert_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_insert_auth ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_orders_update_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_update_auth ON public.purchase_orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_orders_delete_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_delete_auth ON public.purchase_orders
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.purchase_orders TO authenticated, service_role;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achat_purchase_orders'
  ) THEN
    INSERT INTO public.purchase_orders (
      ref_bc, supplier_id, supplier_name, order_date, note, status,
      total_ttc, lines, payload, created_by, created_at, updated_at
    )
    SELECT
      a.ref_bc,
      ps.id,
      COALESCE(ps.company_name, ''),
      a.date_commande,
      a.notes,
      a.statut,
      COALESCE(a.montant, 0),
      COALESCE(a.payload->'lignes', '[]'::jsonb),
      COALESCE(a.payload, '{}'::jsonb),
      a.created_by,
      a.created_at,
      a.updated_at
    FROM public.achat_purchase_orders a
    LEFT JOIN public.purchase_suppliers ps ON ps.id = a.supplier_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.ref_bc IS NOT NULL AND p.ref_bc = a.ref_bc
    );
  END IF;
END $migrate$;

NOTIFY pgrst, 'reload schema';
