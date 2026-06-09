-- =============================================================================
-- CITYMO — GED Module 1 : Mes documents
-- Coller dans Supabase → SQL Editor → Run (une seule fois)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.document_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  department  TEXT,
  parent_id   UUID REFERENCES public.document_folders(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_document_folders_parent_id
  ON public.document_folders (parent_id) WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_system_root_name
  ON public.document_folders (lower(trim(name)))
  WHERE parent_id IS NULL AND is_system = TRUE AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id     UUID REFERENCES public.document_folders(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  file_url      TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  department    TEXT,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  is_public     BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.document_folders(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_folder_id
  ON public.documents (folder_id) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS document_folders_updated_at ON public.document_folders;
CREATE TRIGGER document_folders_updated_at
  BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.document_folders (name, department, is_system, parent_id)
SELECT v.name, v.department, TRUE, NULL
FROM (VALUES
  ('COMMERCIAL',              'COMMERCIAL'),
  ('RESSOURCES HUMAINES',     'RESSOURCES HUMAINES'),
  ('ACHATS',                  'ACHATS'),
  ('MARKETING',               'MARKETING'),
  ('EXPLOITATION',            'EXPLOITATION'),
  ('COMPTABILITÉ',            'COMPTABILITÉ'),
  ('ADMINISTRATION',          'ADMINISTRATION'),
  ('SAV',                     'SAV'),
  ('LOGISTIQUE',              'LOGISTIQUE'),
  ('PROJETS',                 'PROJETS'),
  ('FINANCE & TRÉSORERIE',    'FINANCE & TRÉSORERIE'),
  ('DOCUMENTS GÉNÉRAUX',      'DOCUMENTS GÉNÉRAUX')
) AS v(name, department)
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_folders f
  WHERE f.parent_id IS NULL AND f.is_system = TRUE
    AND lower(trim(f.name)) = lower(trim(v.name)) AND f.is_deleted = FALSE
);

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_folders_select_auth ON public.document_folders;
CREATE POLICY document_folders_select_auth ON public.document_folders
  FOR SELECT TO authenticated USING (is_deleted = FALSE);

DROP POLICY IF EXISTS document_folders_insert_auth ON public.document_folders;
CREATE POLICY document_folders_insert_auth ON public.document_folders
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS document_folders_update_auth ON public.document_folders;
CREATE POLICY document_folders_update_auth ON public.document_folders
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR is_system = FALSE) WITH CHECK (true);

DROP POLICY IF EXISTS documents_select_auth ON public.documents;
CREATE POLICY documents_select_auth ON public.documents
  FOR SELECT TO authenticated USING (is_deleted = FALSE);

DROP POLICY IF EXISTS documents_insert_auth ON public.documents;
CREATE POLICY documents_insert_auth ON public.documents
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS documents_update_auth ON public.documents;
CREATE POLICY documents_update_auth ON public.documents
  FOR UPDATE TO authenticated USING (uploaded_by = auth.uid() OR uploaded_by IS NULL) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.document_folders TO authenticated, service_role;
GRANT ALL ON public.documents TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 'documents', FALSE, 52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip','video/mp4','video/quicktime','text/plain']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
CREATE POLICY documents_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS documents_storage_update ON storage.objects;
CREATE POLICY documents_storage_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

NOTIFY pgrst, 'reload schema';
