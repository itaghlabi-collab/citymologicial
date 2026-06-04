-- Dépenses commerciales / marketing
-- Prérequis : aucun (table autonome)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.depenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intitule            TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'marketing',
  montant             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date                DATE NOT NULL,
  reference           TEXT,
  commentaire         TEXT,
  fournisseur         TEXT,
  projet_campagne     TEXT,
  responsable         TEXT,
  mode_paiement       TEXT,
  justificatif_url    TEXT,
  statut_validation   TEXT NOT NULL DEFAULT 'en_attente',
  reference_id        UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS fournisseur TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS projet_campagne TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS justificatif_url TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS statut_validation TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS reference_id UUID;

ALTER TABLE public.depenses DROP CONSTRAINT IF EXISTS depenses_type_check;
ALTER TABLE public.depenses
  ADD CONSTRAINT depenses_type_check
  CHECK (type IN ('marketing', 'commercial', 'evenement', 'deplacement', 'materiel', 'autre'));

ALTER TABLE public.depenses DROP CONSTRAINT IF EXISTS depenses_statut_validation_check;
ALTER TABLE public.depenses
  ADD CONSTRAINT depenses_statut_validation_check
  CHECK (statut_validation IN ('en_attente', 'valide', 'refuse'));

DROP TRIGGER IF EXISTS depenses_updated_at ON public.depenses;
CREATE TRIGGER depenses_updated_at
  BEFORE UPDATE ON public.depenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_depenses_type ON public.depenses(type);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON public.depenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_depenses_responsable ON public.depenses(responsable);
CREATE INDEX IF NOT EXISTS idx_depenses_projet_campagne ON public.depenses(projet_campagne);
CREATE INDEX IF NOT EXISTS idx_depenses_statut_validation ON public.depenses(statut_validation);
CREATE INDEX IF NOT EXISTS idx_depenses_created_at ON public.depenses(created_at DESC);

ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS depenses_all_auth ON public.depenses;
CREATE POLICY depenses_all_auth ON public.depenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.depenses TO authenticated;
GRANT ALL ON public.depenses TO service_role;
