-- Prospects — module Commercial / Marketing
-- Coller ce fichier en entier dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.prospects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 TEXT NOT NULL CHECK (type IN ('particulier', 'btob')),
  nom                  TEXT NOT NULL,
  prenom               TEXT,
  prenom_interlocuteur TEXT,
  nom_interlocuteur    TEXT,
  email                TEXT,
  telephone            TEXT,
  fonction             TEXT,
  secteur              TEXT,
  niveau_decisionnel   TEXT,
  type_projet          TEXT NOT NULL,
  source               TEXT,
  action               TEXT,
  commentaire          TEXT,
  statut               TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (statut IN ('nouveau', 'en_cours', 'converti', 'perdu')),
  budget               NUMERIC(12, 2),
  ville                TEXT,
  date_contact         DATE,
  prochain_suivi       DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS prenom_interlocuteur TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS nom_interlocuteur TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'nouveau';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS budget NUMERIC(12, 2);
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS date_contact DATE;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS prochain_suivi DATE;

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_statut_check;
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_statut_check
  CHECK (statut IN ('nouveau', 'en_cours', 'converti', 'perdu'));

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prospects_type ON public.prospects(type);
CREATE INDEX IF NOT EXISTS idx_prospects_statut ON public.prospects(statut);
CREATE INDEX IF NOT EXISTS idx_prospects_source ON public.prospects(source);
CREATE INDEX IF NOT EXISTS idx_prospects_ville ON public.prospects(ville);
CREATE INDEX IF NOT EXISTS idx_prospects_type_projet ON public.prospects(type_projet);
CREATE INDEX IF NOT EXISTS idx_prospects_date_contact ON public.prospects(date_contact DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON public.prospects(created_at DESC);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospects_all_auth ON public.prospects;
CREATE POLICY prospects_all_auth ON public.prospects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;
