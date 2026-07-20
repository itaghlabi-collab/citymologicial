-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FACTURES PROFORMA — SQL UNIQUE (Supabase SQL Editor → Run)
-- Crée : crm_proformas, crm_proforma_lignes, crm_factures.proforma_id + RLS
-- Source : migrations/20260720120000_crm_proformas.sql
-- Prérequis : clients, crm_devis, crm_factures, articles, categories,
--             public.set_updated_at()
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) En-têtes proforma
CREATE TABLE IF NOT EXISTS public.crm_proformas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT NOT NULL,
  titre               TEXT NOT NULL DEFAULT '',
  objet               TEXT,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  date_emission       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validite       DATE,
  commercial          TEXT,
  type_projet         TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  devis_id            UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL,
  facture_id          UUID REFERENCES public.crm_factures(id) ON DELETE SET NULL,
  converted_at        TIMESTAMPTZ,
  modalites_paiement  TEXT,
  conditions          TEXT,
  notes_internes      TEXT,
  notes               TEXT,
  total_ht            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_proformas_numero_unique UNIQUE (numero)
);

ALTER TABLE public.crm_proformas DROP CONSTRAINT IF EXISTS crm_proformas_statut_check;
ALTER TABLE public.crm_proformas
  ADD CONSTRAINT crm_proformas_statut_check
  CHECK (statut IN (
    'brouillon',
    'envoyee',
    'acceptee',
    'refusee',
    'expiree',
    'convertie',
    'annulee'
  ));

DROP TRIGGER IF EXISTS crm_proformas_updated_at ON public.crm_proformas;
CREATE TRIGGER crm_proformas_updated_at
  BEFORE UPDATE ON public.crm_proformas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_proformas_client_id ON public.crm_proformas(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_devis_id ON public.crm_proformas(devis_id);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_facture_id ON public.crm_proformas(facture_id);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_statut ON public.crm_proformas(statut);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_numero ON public.crm_proformas(numero);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_date_emission ON public.crm_proformas(date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_crm_proformas_created_at ON public.crm_proformas(created_at DESC);

-- 2) Lignes proforma
CREATE TABLE IF NOT EXISTS public.crm_proforma_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id   UUID NOT NULL REFERENCES public.crm_proformas(id) ON DELETE CASCADE,
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

ALTER TABLE public.crm_proforma_lignes DROP CONSTRAINT IF EXISTS crm_proforma_lignes_type_check;
ALTER TABLE public.crm_proforma_lignes
  ADD CONSTRAINT crm_proforma_lignes_type_check
  CHECK (type IN ('article', 'titre', 'sous_titre', 'note'));

DROP TRIGGER IF EXISTS crm_proforma_lignes_updated_at ON public.crm_proforma_lignes;
CREATE TRIGGER crm_proforma_lignes_updated_at
  BEFORE UPDATE ON public.crm_proforma_lignes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_proforma_lignes_proforma_id ON public.crm_proforma_lignes(proforma_id);
CREATE INDEX IF NOT EXISTS idx_crm_proforma_lignes_article_id ON public.crm_proforma_lignes(article_id);
CREATE INDEX IF NOT EXISTS idx_crm_proforma_lignes_ordre ON public.crm_proforma_lignes(proforma_id, ordre);

-- 3) Lien inverse facture → proforma
ALTER TABLE public.crm_factures
  ADD COLUMN IF NOT EXISTS proforma_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_factures_proforma_id_fkey'
  ) THEN
    ALTER TABLE public.crm_factures
      ADD CONSTRAINT crm_factures_proforma_id_fkey
      FOREIGN KEY (proforma_id) REFERENCES public.crm_proformas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_factures_proforma_id ON public.crm_factures(proforma_id);

-- 4) RLS
ALTER TABLE public.crm_proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_proforma_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_proformas_all_auth ON public.crm_proformas;
CREATE POLICY crm_proformas_all_auth ON public.crm_proformas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_proforma_lignes_all_auth ON public.crm_proforma_lignes;
CREATE POLICY crm_proforma_lignes_all_auth ON public.crm_proforma_lignes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.crm_proformas IS
  'Factures proforma CRM — document non comptable, numérotation PF-YYYY-##### indépendante de FAC.';
COMMENT ON COLUMN public.crm_factures.proforma_id IS
  'Proforma d''origine si la facture a été créée par conversion (lien inverse).';
COMMENT ON COLUMN public.crm_proformas.facture_id IS
  'Facture classique générée après conversion (lien direct).';
