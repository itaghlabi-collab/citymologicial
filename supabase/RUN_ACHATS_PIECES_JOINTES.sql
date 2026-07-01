-- ═══════════════════════════════════════════════════════════════════════════
-- CITYMO — Pièces jointes demandes d'achat (Supabase Storage)
-- À coller dans Supabase → SQL Editor → Run
--
-- Stocke les fichiers dans le bucket citymo-documents, dossier achats/
-- Formats : PDF, JPG, PNG, WebP, GIF, Word — max 50 Mo
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-documents',
  'citymo-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS citymo_documents_storage_select ON storage.objects;
CREATE POLICY citymo_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'citymo-documents');

DROP POLICY IF EXISTS citymo_documents_storage_insert ON storage.objects;
CREATE POLICY citymo_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'citymo-documents');

DROP POLICY IF EXISTS citymo_documents_storage_delete ON storage.objects;
CREATE POLICY citymo_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'citymo-documents');

SELECT 'Bucket citymo-documents OK — pièces jointes achats activées' AS status;
