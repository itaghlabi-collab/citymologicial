-- CITYMO — Partages documents (document_shares)
-- À exécuter dans le SQL Editor Supabase si le bouton Partager échoue.

CREATE TABLE IF NOT EXISTS public.document_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  document_name   TEXT NOT NULL,
  partage_par     TEXT,
  partage_avec    TEXT NOT NULL,
  departement     TEXT,
  date_partage    DATE,
  date_expiration DATE,
  permissions     TEXT NOT NULL DEFAULT 'Lecture seule',
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_shares_document_id ON public.document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_departement ON public.document_shares(departement);

ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_shares_select_auth ON public.document_shares;
CREATE POLICY document_shares_select_auth ON public.document_shares
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS document_shares_insert_auth ON public.document_shares;
CREATE POLICY document_shares_insert_auth ON public.document_shares
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS document_shares_update_auth ON public.document_shares;
CREATE POLICY document_shares_update_auth ON public.document_shares
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS document_shares_delete_auth ON public.document_shares;
CREATE POLICY document_shares_delete_auth ON public.document_shares
  FOR DELETE TO authenticated USING (true);

GRANT ALL ON public.document_shares TO authenticated, service_role;

-- Permettre le marquage is_shared à tout utilisateur authentifié
DROP POLICY IF EXISTS documents_update_auth ON public.documents;
CREATE POLICY documents_update_auth ON public.documents
  FOR UPDATE TO authenticated
  USING (is_deleted = FALSE)
  WITH CHECK (is_deleted = FALSE);
