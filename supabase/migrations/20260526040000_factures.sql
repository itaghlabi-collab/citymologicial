-- CRM Factures (module CRM — tables crm_factures / crm_facture_lignes)
-- devis_id → crm_devis (devis CRM)

CREATE TABLE IF NOT EXISTS public.crm_factures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT NOT NULL,
  titre               TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  date_emission       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance       DATE,
  commercial          TEXT,
  type_projet         TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  devis_id            UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL,
  modalites_paiement  TEXT,
  conditions          TEXT,
  notes_internes      TEXT,
  acompte_montant     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  acompte_type        TEXT NOT NULL DEFAULT 'fixe',
  total_ht            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paye          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reste_a_payer       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_factures_numero_unique UNIQUE (numero)
);

ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devis_id UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS acompte_montant NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS acompte_type TEXT NOT NULL DEFAULT 'fixe';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS total_paye NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS reste_a_payer NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_statut_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_statut_check
  CHECK (statut IN (
    'brouillon', 'envoyee', 'payee', 'partiellement_payee',
    'impayee', 'en_retard', 'annulee'
  ));

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_acompte_type_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_acompte_type_check
  CHECK (acompte_type IN ('fixe', 'pct'));

DROP TRIGGER IF EXISTS crm_factures_updated_at ON public.crm_factures;
CREATE TRIGGER crm_factures_updated_at
  BEFORE UPDATE ON public.crm_factures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_factures_client_id ON public.crm_factures(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_factures_devis_id ON public.crm_factures(devis_id);
CREATE INDEX IF NOT EXISTS idx_crm_factures_statut ON public.crm_factures(statut);
CREATE INDEX IF NOT EXISTS idx_crm_factures_numero ON public.crm_factures(numero);
CREATE INDEX IF NOT EXISTS idx_crm_factures_date_emission ON public.crm_factures(date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_crm_factures_total_ttc ON public.crm_factures(total_ttc);
CREATE INDEX IF NOT EXISTS idx_crm_factures_created_at ON public.crm_factures(created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_facture_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.crm_factures(id) ON DELETE CASCADE,
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

ALTER TABLE public.crm_facture_lignes DROP CONSTRAINT IF EXISTS crm_facture_lignes_type_check;
ALTER TABLE public.crm_facture_lignes
  ADD CONSTRAINT crm_facture_lignes_type_check
  CHECK (type IN ('article', 'titre', 'sous_titre', 'note'));

DROP TRIGGER IF EXISTS crm_facture_lignes_updated_at ON public.crm_facture_lignes;
CREATE TRIGGER crm_facture_lignes_updated_at
  BEFORE UPDATE ON public.crm_facture_lignes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_facture_id ON public.crm_facture_lignes(facture_id);
CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_article_id ON public.crm_facture_lignes(article_id);
CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_ordre ON public.crm_facture_lignes(facture_id, ordre);

CREATE TABLE IF NOT EXISTS public.crm_facture_paiements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.crm_factures(id) ON DELETE CASCADE,
  montant       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE,
  mode          TEXT NOT NULL DEFAULT 'virement',
  reference     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_facture_paiements_facture_id ON public.crm_facture_paiements(facture_id);

ALTER TABLE public.crm_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_facture_paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_factures_all_auth ON public.crm_factures;
CREATE POLICY crm_factures_all_auth ON public.crm_factures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_facture_lignes_all_auth ON public.crm_facture_lignes;
CREATE POLICY crm_facture_lignes_all_auth ON public.crm_facture_lignes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_facture_paiements_all_auth ON public.crm_facture_paiements;
CREATE POLICY crm_facture_paiements_all_auth ON public.crm_facture_paiements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.crm_factures TO authenticated;
GRANT ALL ON public.crm_factures TO service_role;
GRANT ALL ON public.crm_facture_lignes TO authenticated;
GRANT ALL ON public.crm_facture_lignes TO service_role;
GRANT ALL ON public.crm_facture_paiements TO authenticated;
GRANT ALL ON public.crm_facture_paiements TO service_role;
