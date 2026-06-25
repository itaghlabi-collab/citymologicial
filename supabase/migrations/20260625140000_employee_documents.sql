-- Employés — dossier documentaire (employee_documents + bucket citymo-employees)

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  file_size     BIGINT,
  category      TEXT NOT NULL DEFAULT 'autre',
  doc_type      TEXT NOT NULL DEFAULT 'autre',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON public.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_category ON public.employee_documents(category);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_documents_all_auth ON public.employee_documents;
CREATE POLICY employee_documents_all_auth ON public.employee_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-employees',
  'citymo-employees',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS citymo_employees_storage_select ON storage.objects;
CREATE POLICY citymo_employees_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'citymo-employees');

DROP POLICY IF EXISTS citymo_employees_storage_insert ON storage.objects;
CREATE POLICY citymo_employees_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'citymo-employees');

DROP POLICY IF EXISTS citymo_employees_storage_delete ON storage.objects;
CREATE POLICY citymo_employees_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'citymo-employees');
