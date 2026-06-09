-- CITYMO — Liens publics documents (document_public_links)
-- À exécuter dans le SQL Editor Supabase.

CREATE TABLE IF NOT EXISTS public.document_public_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  document_name   TEXT NOT NULL,
  departement     TEXT,
  token           TEXT NOT NULL UNIQUE,
  expiration      DATE,
  mot_de_passe    TEXT,
  acces_unique    BOOLEAN NOT NULL DEFAULT FALSE,
  telechargement  BOOLEAN NOT NULL DEFAULT TRUE,
  lecture_seule   BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  acces_count     INTEGER NOT NULL DEFAULT 0,
  download_count  INTEGER NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'desactive')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_public_links_token ON public.document_public_links(token);
CREATE INDEX IF NOT EXISTS idx_document_public_links_document_id ON public.document_public_links(document_id);
CREATE INDEX IF NOT EXISTS idx_document_public_links_statut ON public.document_public_links(statut);

ALTER TABLE public.document_public_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_public_links_select_auth ON public.document_public_links;
CREATE POLICY document_public_links_select_auth ON public.document_public_links
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS document_public_links_insert_auth ON public.document_public_links;
CREATE POLICY document_public_links_insert_auth ON public.document_public_links
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS document_public_links_update_auth ON public.document_public_links;
CREATE POLICY document_public_links_update_auth ON public.document_public_links
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS document_public_links_delete_auth ON public.document_public_links;
CREATE POLICY document_public_links_delete_auth ON public.document_public_links
  FOR DELETE TO authenticated USING (true);

GRANT ALL ON public.document_public_links TO authenticated, service_role;

-- Lecture publique par token (sans exposer toute la table)
CREATE OR REPLACE FUNCTION public.get_document_public_link(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  row public.document_public_links%ROWTYPE;
  today DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO row FROM public.document_public_links WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF row.statut = 'desactive' THEN
    RETURN json_build_object('error', 'disabled');
  END IF;

  IF row.expiration IS NOT NULL AND row.expiration < today THEN
    RETURN json_build_object('error', 'expired', 'expiration', row.expiration);
  END IF;

  IF row.acces_unique AND row.acces_count > 0 THEN
    RETURN json_build_object('error', 'used');
  END IF;

  RETURN json_build_object(
    'id', row.id,
    'document_id', row.document_id,
    'document', row.document_name,
    'departement', row.departement,
    'token', row.token,
    'expiration', row.expiration,
    'has_password', (row.mot_de_passe IS NOT NULL AND row.mot_de_passe <> ''),
    'acces_unique', row.acces_unique,
    'telechargement', row.telechargement,
    'lecture_seule', row.lecture_seule,
    'acces_count', row.acces_count,
    'statut', row.statut,
    'date_creation', to_char(row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_document_public_link(p_token TEXT, p_password TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.document_public_links%ROWTYPE;
  meta JSON;
BEGIN
  meta := public.get_document_public_link(p_token);
  IF (meta->>'error') IS NOT NULL THEN
    RETURN meta;
  END IF;

  SELECT * INTO row FROM public.document_public_links WHERE token = p_token LIMIT 1;

  IF row.mot_de_passe IS NOT NULL AND row.mot_de_passe <> '' THEN
    IF p_password IS NULL OR p_password <> row.mot_de_passe THEN
      RETURN json_build_object('error', 'bad_password');
    END IF;
  END IF;

  UPDATE public.document_public_links
  SET acces_count = acces_count + 1,
      updated_at = NOW()
  WHERE id = row.id;

  IF row.acces_unique THEN
    UPDATE public.document_public_links
    SET statut = 'desactive', updated_at = NOW()
    WHERE id = row.id;
  END IF;

  RETURN meta || json_build_object('verified', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_document_public_link(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_document_public_link(TEXT, TEXT) TO anon, authenticated, service_role;
