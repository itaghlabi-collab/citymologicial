-- =============================================================================
-- CITYMO — Achats : Fournisseurs (purchase_suppliers)
-- Coller dans Supabase → SQL Editor → Run (une seule fois)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.purchase_suppliers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name              TEXT NOT NULL,
  ice                       TEXT,
  rc                        TEXT,
  tax_id                    TEXT,
  phone                     TEXT,
  email                     TEXT,
  address                   TEXT,
  city                      TEXT,
  main_contact              TEXT,
  contact_role              TEXT,
  contact_phone             TEXT,
  contact_email             TEXT,
  supplier_category         TEXT,
  payment_terms             TEXT,
  preferred_payment_method  TEXT DEFAULT 'Virement',
  rib                       TEXT,
  bank                      TEXT,
  status                    TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  notes                     TEXT,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_company_name
  ON public.purchase_suppliers (lower(trim(company_name)));

CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_status
  ON public.purchase_suppliers (status);

DROP TRIGGER IF EXISTS purchase_suppliers_updated_at ON public.purchase_suppliers;
CREATE TRIGGER purchase_suppliers_updated_at
  BEFORE UPDATE ON public.purchase_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_suppliers_select_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_select_auth ON public.purchase_suppliers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_suppliers_insert_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_insert_auth ON public.purchase_suppliers
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_suppliers_update_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_update_auth ON public.purchase_suppliers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_suppliers_delete_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_delete_auth ON public.purchase_suppliers
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.purchase_suppliers TO authenticated, service_role;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achat_suppliers'
  ) THEN
    INSERT INTO public.purchase_suppliers (
      company_name, ice, rc, tax_id, phone, email, address, city,
      main_contact, supplier_category, preferred_payment_method, rib, bank,
      status, notes, created_by, created_at, updated_at
    )
    SELECT
      a.raison_sociale, a.ice, a.rc, a.if_field, a.telephone, a.email,
      a.adresse, a.ville, a.contact, a.categorie, a.mode_paiement, a.rib, a.banque,
      CASE
        WHEN lower(coalesce(a.statut, '')) IN ('inactif', 'inactive') THEN 'inactive'
        WHEN lower(coalesce(a.statut, '')) IN ('archivé', 'archive', 'archived') THEN 'archived'
        ELSE 'active'
      END,
      a.notes, a.created_by, a.created_at, a.updated_at
    FROM public.achat_suppliers a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_suppliers p
      WHERE lower(trim(p.company_name)) = lower(trim(a.raison_sociale))
        AND coalesce(p.ice, '') = coalesce(a.ice, '')
    );
  END IF;
END $migrate$;

NOTIFY pgrst, 'reload schema';

SELECT 'purchase_suppliers' AS table_name, COUNT(*)::int AS lignes FROM public.purchase_suppliers;
