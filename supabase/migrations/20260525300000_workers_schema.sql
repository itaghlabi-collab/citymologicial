-- CITYMO ERP — Ouvriers / workers (Employés Externes)
-- Run in Supabase SQL Editor or: supabase db push

-- ─── WORKERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_cin          TEXT UNIQUE,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  telephone           TEXT,
  fonction            TEXT,
  specialite          TEXT,
  tarif               NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tarif >= 0),
  experience          TEXT DEFAULT 'intermediaire'
    CHECK (experience IN ('debutant', 'intermediaire', 'confirme', 'expert')),
  date_naissance      DATE,
  lieu_naissance      TEXT,
  adresse             TEXT,
  nationalite         TEXT DEFAULT 'Marocaine',
  etat_civil          TEXT,
  groupe_sanguin      TEXT,
  sexe                TEXT CHECK (sexe IS NULL OR sexe IN ('M', 'F')),
  date_expiration     DATE,
  date_recrutement    DATE,
  statut              TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'en_chantier', 'disponible', 'suspendu', 'archive')),
  disponibilite       TEXT DEFAULT 'oui',
  chantier            TEXT,
  badge               TEXT,
  contact_urgence     TEXT,
  tel_urgence         TEXT,
  relation_urgence    TEXT,
  pointure            TEXT,
  taille_vetement     TEXT,
  taille_gants        TEXT,
  casque              TEXT,
  photo_url           TEXT,
  cin_recto_url       TEXT,
  cin_verso_url       TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS workers_updated_at ON public.workers;
CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_workers_numero_cin ON public.workers(numero_cin);
CREATE INDEX IF NOT EXISTS idx_workers_statut ON public.workers(statut);
CREATE INDEX IF NOT EXISTS idx_workers_fonction ON public.workers(fonction);
CREATE INDEX IF NOT EXISTS idx_workers_chantier ON public.workers(chantier);
CREATE INDEX IF NOT EXISTS idx_workers_nom ON public.workers(nom, prenom);

-- ─── WORKER DOCUMENTS (CIN + pièces jointes) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL
    CHECK (doc_type IN ('cin_recto', 'cin_verso', 'photo', 'other')),
  storage_path    TEXT NOT NULL,
  file_name       TEXT,
  mime_type       TEXT,
  file_size       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_id ON public.worker_documents(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_documents_doc_type ON public.worker_documents(doc_type);

-- ─── FK attendance / payroll → workers ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_worker_id_fkey'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_worker_id_fkey'
  ) THEN
    ALTER TABLE public.payroll
      ADD CONSTRAINT payroll_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── RLS workers ────────────────────────────────────────────────────────────
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workers_select_auth ON public.workers;
CREATE POLICY workers_select_auth ON public.workers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workers_insert_auth ON public.workers;
CREATE POLICY workers_insert_auth ON public.workers
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS workers_update_auth ON public.workers;
CREATE POLICY workers_update_auth ON public.workers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS workers_delete_auth ON public.workers;
CREATE POLICY workers_delete_auth ON public.workers
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS worker_documents_select_auth ON public.worker_documents;
CREATE POLICY worker_documents_select_auth ON public.worker_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS worker_documents_insert_auth ON public.worker_documents;
CREATE POLICY worker_documents_insert_auth ON public.worker_documents
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS worker_documents_update_auth ON public.worker_documents;
CREATE POLICY worker_documents_update_auth ON public.worker_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS worker_documents_delete_auth ON public.worker_documents;
CREATE POLICY worker_documents_delete_auth ON public.worker_documents
  FOR DELETE TO authenticated USING (true);

-- ─── STORAGE bucket (privé — signed URLs côté client) ───────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-workers',
  'citymo-workers',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated: lecture / écriture dans citymo-workers (paths workers/cin/, workers/photos/)
DROP POLICY IF EXISTS citymo_workers_select ON storage.objects;
CREATE POLICY citymo_workers_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_insert ON storage.objects;
CREATE POLICY citymo_workers_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_update ON storage.objects;
CREATE POLICY citymo_workers_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'citymo-workers')
  WITH CHECK (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_delete ON storage.objects;
CREATE POLICY citymo_workers_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'citymo-workers');
