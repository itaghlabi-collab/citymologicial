-- citymo-backups : autoriser tous les MIME (copie physique JPEG/PNG/PDF/Office/…)
-- Cause des échecs BCK : allowed_mime_types limité à json/gzip/octet-stream/text.

UPDATE storage.buckets
SET
  allowed_mime_types = NULL,
  file_size_limit = COALESCE(file_size_limit, 524288000)
WHERE id = 'citymo-backups';

-- Garde-fou si le bucket n'existait pas encore
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('citymo-backups', 'citymo-backups', false, 524288000, NULL)
ON CONFLICT (id) DO UPDATE
SET
  allowed_mime_types = NULL,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit);
