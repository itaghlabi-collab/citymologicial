-- =============================================================================
-- CITYMO — Achats : Comparaison de devis (purchase_quote_comparisons)
-- Coller dans Supabase → SQL Editor → Run (une seule fois)
-- Prérequis : purchase_suppliers, projects
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.purchase_quote_comparisons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_comparison          TEXT,
  title                   TEXT NOT NULL,
  project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref             TEXT,
  project_name            TEXT,
  purchase_category       TEXT,
  description             TEXT,
  status                  TEXT NOT NULL DEFAULT 'En cours',
  lines                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_supplier_id    UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  selected_supplier_name  TEXT,
  best_price              NUMERIC(14, 2),
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS project_ref TEXT;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS project_name TEXT;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS purchase_category TEXT;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS selected_supplier_id UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS selected_supplier_name TEXT;

ALTER TABLE public.purchase_quote_comparisons
  ADD COLUMN IF NOT EXISTS best_price NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS idx_purchase_quote_comparisons_status
  ON public.purchase_quote_comparisons (status);

CREATE INDEX IF NOT EXISTS idx_purchase_quote_comparisons_project_id
  ON public.purchase_quote_comparisons (project_id);

CREATE INDEX IF NOT EXISTS idx_purchase_quote_comparisons_created_at
  ON public.purchase_quote_comparisons (created_at DESC);

DROP TRIGGER IF EXISTS purchase_quote_comparisons_updated_at ON public.purchase_quote_comparisons;
CREATE TRIGGER purchase_quote_comparisons_updated_at
  BEFORE UPDATE ON public.purchase_quote_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_quote_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_quote_comparisons_select_auth ON public.purchase_quote_comparisons;
CREATE POLICY purchase_quote_comparisons_select_auth ON public.purchase_quote_comparisons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS purchase_quote_comparisons_insert_auth ON public.purchase_quote_comparisons;
CREATE POLICY purchase_quote_comparisons_insert_auth ON public.purchase_quote_comparisons
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS purchase_quote_comparisons_update_auth ON public.purchase_quote_comparisons;
CREATE POLICY purchase_quote_comparisons_update_auth ON public.purchase_quote_comparisons
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_quote_comparisons_delete_auth ON public.purchase_quote_comparisons;
CREATE POLICY purchase_quote_comparisons_delete_auth ON public.purchase_quote_comparisons
  FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.purchase_quote_comparisons TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
