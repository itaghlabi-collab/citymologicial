-- Achats — demandes de récupération liées aux OP payés
-- Voir supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.achat_demandes_recuperation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   TEXT UNIQUE,
  qui                   TEXT,
  quand                 DATE,
  quoi                  TEXT,
  statut                TEXT NOT NULL DEFAULT 'prete_a_recuperer',
  payment_order_id      UUID,
  purchase_request_id   UUID,
  purchase_request_ref  TEXT,
  purchase_oa_ref       TEXT,
  fournisseur           TEXT,
  projet                TEXT,
  chauffeur             TEXT,
  vehicule              TEXT,
  date_recuperation     DATE,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS payment_order_id UUID;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS purchase_request_id UUID;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS purchase_request_ref TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS purchase_oa_ref TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS fournisseur TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS projet TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS vehicule TEXT;
ALTER TABLE public.achat_demandes_recuperation ADD COLUMN IF NOT EXISTS date_recuperation DATE;

UPDATE public.achat_demandes_recuperation
SET statut = 'prete_a_recuperer'
WHERE statut IN ('a_recuperer');

ALTER TABLE public.achat_demandes_recuperation DROP CONSTRAINT IF EXISTS achat_demandes_recuperation_statut_check;
ALTER TABLE public.achat_demandes_recuperation
  ADD CONSTRAINT achat_demandes_recuperation_statut_check
  CHECK (statut IN ('prete_a_recuperer', 'recuperee', 'annulee'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_achat_dem_recup_payment_order
  ON public.achat_demandes_recuperation (payment_order_id)
  WHERE payment_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS achat_demandes_recuperation_updated_at ON public.achat_demandes_recuperation;
CREATE TRIGGER achat_demandes_recuperation_updated_at
  BEFORE UPDATE ON public.achat_demandes_recuperation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_achat_dem_recup_statut ON public.achat_demandes_recuperation (statut);
CREATE INDEX IF NOT EXISTS idx_achat_dem_recup_da ON public.achat_demandes_recuperation (purchase_request_id);

ALTER TABLE public.achat_demandes_recuperation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS achat_demandes_recuperation_all_auth ON public.achat_demandes_recuperation;
CREATE POLICY achat_demandes_recuperation_all_auth ON public.achat_demandes_recuperation
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.achat_demandes_recuperation TO authenticated;
GRANT ALL ON public.achat_demandes_recuperation TO service_role;
