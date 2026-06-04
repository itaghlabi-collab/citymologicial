-- Actions marketing / campagnes
-- Prérequis : aucun (table autonome)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.actions_marketing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  type            TEXT NOT NULL,
  canal           TEXT NOT NULL DEFAULT 'meta',
  budget          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date_debut      DATE,
  date_fin        DATE,
  priorite        TEXT NOT NULL DEFAULT 'normale',
  statut          TEXT NOT NULL DEFAULT 'en_attente',
  description     TEXT,
  objectif        TEXT,
  responsable     TEXT,
  leads_generes   INTEGER NOT NULL DEFAULT 0,
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS objectif TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS leads_generes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS commentaire TEXT;

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_canal_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_canal_check
  CHECK (canal IN ('meta', 'google', 'tiktok', 'offline', 'email', 'autre'));

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_priorite_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_priorite_check
  CHECK (priorite IN ('haute', 'normale', 'basse'));

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_statut_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'valide', 'termine', 'annule'));

DROP TRIGGER IF EXISTS actions_marketing_updated_at ON public.actions_marketing;
CREATE TRIGGER actions_marketing_updated_at
  BEFORE UPDATE ON public.actions_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_actions_marketing_statut ON public.actions_marketing(statut);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_canal ON public.actions_marketing(canal);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_type ON public.actions_marketing(type);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_date_debut ON public.actions_marketing(date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_responsable ON public.actions_marketing(responsable);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_created_at ON public.actions_marketing(created_at DESC);

ALTER TABLE public.actions_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actions_marketing_all_auth ON public.actions_marketing;
CREATE POLICY actions_marketing_all_auth ON public.actions_marketing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.actions_marketing TO authenticated;
GRANT ALL ON public.actions_marketing TO service_role;
