-- CRM Devis (module CRM — distinct de public.devis commercial/prospects)
-- Tables : crm_devis, crm_devis_lignes

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.crm_devis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT NOT NULL,
  titre               TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  date_creation       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validite       DATE,
  commercial          TEXT,
  type_projet         TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  modalites_paiement  TEXT,
  conditions          TEXT,
  notes_internes      TEXT,
  total_ht            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_devis_reference_unique UNIQUE (reference)
);

ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS commercial TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS modalites_paiement TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS notes_internes TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_tva NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_devis DROP CONSTRAINT IF EXISTS crm_devis_statut_check;
ALTER TABLE public.crm_devis
  ADD CONSTRAINT crm_devis_statut_check
  CHECK (statut IN ('brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente'));

DROP TRIGGER IF EXISTS crm_devis_updated_at ON public.crm_devis;
CREATE TRIGGER crm_devis_updated_at
  BEFORE UPDATE ON public.crm_devis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_devis_client_id ON public.crm_devis(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_statut ON public.crm_devis(statut);
CREATE INDEX IF NOT EXISTS idx_crm_devis_reference ON public.crm_devis(reference);
CREATE INDEX IF NOT EXISTS idx_crm_devis_date_creation ON public.crm_devis(date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_crm_devis_created_at ON public.crm_devis(created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_devis_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id      UUID NOT NULL REFERENCES public.crm_devis(id) ON DELETE CASCADE,
  ordre         INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'article',
  designation   TEXT,
  description   TEXT,
  article_id    UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  categorie_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  quantite      NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unite         TEXT NOT NULL DEFAULT 'unite',
  prix_ht       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remise        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tva           NUMERIC(5, 2) NOT NULL DEFAULT 20,
  total_ht      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS ordre INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'article';
ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_devis_lignes DROP CONSTRAINT IF EXISTS crm_devis_lignes_type_check;
ALTER TABLE public.crm_devis_lignes
  ADD CONSTRAINT crm_devis_lignes_type_check
  CHECK (type IN ('article', 'titre', 'sous_titre', 'note'));

DROP TRIGGER IF EXISTS crm_devis_lignes_updated_at ON public.crm_devis_lignes;
CREATE TRIGGER crm_devis_lignes_updated_at
  BEFORE UPDATE ON public.crm_devis_lignes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_devis_id ON public.crm_devis_lignes(devis_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_article_id ON public.crm_devis_lignes(article_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_categorie_id ON public.crm_devis_lignes(categorie_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_ordre ON public.crm_devis_lignes(devis_id, ordre);

ALTER TABLE public.crm_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_devis_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_devis_all_auth ON public.crm_devis;
CREATE POLICY crm_devis_all_auth ON public.crm_devis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_devis_lignes_all_auth ON public.crm_devis_lignes;
CREATE POLICY crm_devis_lignes_all_auth ON public.crm_devis_lignes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.crm_devis TO authenticated;
GRANT ALL ON public.crm_devis TO service_role;
GRANT ALL ON public.crm_devis_lignes TO authenticated;
GRANT ALL ON public.crm_devis_lignes TO service_role;
