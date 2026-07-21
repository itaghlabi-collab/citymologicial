-- CITYMO — Annuaire Fournisseurs (étapes 2+) : champs complémentaires + favoris
-- Additive / idempotent — ne touche PAS aux fournisseurs existants ni aux achats.
-- Exécuter APRÈS RUN_PURCHASE_SUPPLIER_CATEGORIES.sql (si pas déjà fait).
-- Coller dans Supabase → SQL Editor → Run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Colonnes optionnelles sur purchase_suppliers ─────────────────────────────
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS cnss TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS products_services TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS brands TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS delivery_zone TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS avg_delivery_delay TEXT;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(14, 2);
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS installation_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS sav_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.purchase_suppliers ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_trade_name
  ON public.purchase_suppliers (lower(trim(trade_name)));
CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_region
  ON public.purchase_suppliers (lower(trim(region)));
CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_recommended
  ON public.purchase_suppliers (is_recommended)
  WHERE is_recommended = TRUE;
CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_city_lower
  ON public.purchase_suppliers (lower(trim(city)));

-- ── Favoris personnels ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_supplier_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id  UUID NOT NULL REFERENCES public.purchase_suppliers(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_supplier_favorites_user
  ON public.purchase_supplier_favorites (user_id);

ALTER TABLE public.purchase_supplier_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_supplier_favorites_select_own ON public.purchase_supplier_favorites;
CREATE POLICY purchase_supplier_favorites_select_own ON public.purchase_supplier_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS purchase_supplier_favorites_insert_own ON public.purchase_supplier_favorites;
CREATE POLICY purchase_supplier_favorites_insert_own ON public.purchase_supplier_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS purchase_supplier_favorites_delete_own ON public.purchase_supplier_favorites;
CREATE POLICY purchase_supplier_favorites_delete_own ON public.purchase_supplier_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT ALL ON public.purchase_supplier_favorites TO authenticated, service_role;

SELECT 'purchase_suppliers annuaire champs + favoris OK' AS status;
