-- Module Projets — fichiers (Storage + project_documents)
-- Prérequis : table public.projects

CREATE TABLE IF NOT EXISTS public.project_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  file_size     BIGINT,
  category      TEXT NOT NULL DEFAULT 'autre',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_category_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_category_check
  CHECK (category IN ('plan', 'devis', 'photo', 'contrat', 'autre'));

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_created_at ON public.project_documents(created_at DESC);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_documents_all_auth ON public.project_documents;
CREATE POLICY project_documents_all_auth ON public.project_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_documents TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-projects',
  'citymo-projects',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS citymo_projects_storage_select ON storage.objects;
CREATE POLICY citymo_projects_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'citymo-projects');

DROP POLICY IF EXISTS citymo_projects_storage_insert ON storage.objects;
CREATE POLICY citymo_projects_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'citymo-projects');

DROP POLICY IF EXISTS citymo_projects_storage_update ON storage.objects;
CREATE POLICY citymo_projects_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'citymo-projects') WITH CHECK (bucket_id = 'citymo-projects');

DROP POLICY IF EXISTS citymo_projects_storage_delete ON storage.objects;
CREATE POLICY citymo_projects_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'citymo-projects');

NOTIFY pgrst, 'reload schema';

SELECT 'project_documents OK' AS status, COUNT(*) AS nb FROM public.project_documents;
