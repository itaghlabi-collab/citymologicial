-- À exécuter dans le SQL Editor Supabase si la migration n'est pas encore appliquée.
-- Corrige : « mime type image/jpeg is not supported » / « image/png is not supported »
-- sur le bucket citymo-backups lors des sauvegardes complètes.

UPDATE storage.buckets
SET
  allowed_mime_types = NULL,
  file_size_limit = COALESCE(file_size_limit, 524288000)
WHERE id = 'citymo-backups';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('citymo-backups', 'citymo-backups', false, 524288000, NULL)
ON CONFLICT (id) DO UPDATE
SET
  allowed_mime_types = NULL,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit);

-- Vérification
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'citymo-backups';
