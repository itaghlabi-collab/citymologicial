-- CRM Bons de livraison — delivery_notes / delivery_note_items

CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_nom          TEXT,
  adresse_livraison   TEXT,
  date_livraison      DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance       DATE,
  commercial          TEXT,
  prepare_par         TEXT,
  projet              TEXT,
  devis_id            UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL,
  facture_id          UUID REFERENCES public.crm_factures(id) ON DELETE SET NULL,
  devis_reference     TEXT,
  facture_reference   TEXT,
  contact_reception   TEXT,
  tel_reception       TEXT,
  remarques           TEXT,
  notes_internes      TEXT,
  signature_client    TEXT,
  date_validation     DATE,
  est_facture         BOOLEAN NOT NULL DEFAULT FALSE,
  pct_livre           NUMERIC(6, 2) NOT NULL DEFAULT 0,
  total_articles      INTEGER NOT NULL DEFAULT 0,
  total_commandees    NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_livrees       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_restantes     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_notes_numero_unique UNIQUE (numero)
);

ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS prepare_par TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS devis_reference TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS facture_reference TEXT;

ALTER TABLE public.delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_statut_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_statut_check
  CHECK (statut IN (
    'brouillon', 'preparation', 'en_attente', 'livre',
    'partiellement_livre', 'facture', 'annule'
  ));

DROP TRIGGER IF EXISTS delivery_notes_updated_at ON public.delivery_notes;
CREATE TRIGGER delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_delivery_notes_client_id ON public.delivery_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_statut ON public.delivery_notes(statut);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_numero ON public.delivery_notes(numero);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_date_livraison ON public.delivery_notes(date_livraison DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_devis_id ON public.delivery_notes(devis_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_facture_id ON public.delivery_notes(facture_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_at ON public.delivery_notes(created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_note_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id      UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  ordre                 INTEGER NOT NULL DEFAULT 0,
  article_id            UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  categorie_id          UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  designation           TEXT,
  description           TEXT,
  unite                 TEXT NOT NULL DEFAULT 'unite',
  quantite_commandee    NUMERIC(14, 3) NOT NULL DEFAULT 1,
  quantite_livree       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantite_restante     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  remarque              TEXT,
  statut_ligne          TEXT NOT NULL DEFAULT 'a_livrer',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_note_items ADD COLUMN IF NOT EXISTS remarque TEXT;

ALTER TABLE public.delivery_note_items DROP CONSTRAINT IF EXISTS delivery_note_items_statut_ligne_check;
ALTER TABLE public.delivery_note_items
  ADD CONSTRAINT delivery_note_items_statut_ligne_check
  CHECK (statut_ligne IN ('a_livrer', 'livre', 'non_livre', 'en_attente'));

DROP TRIGGER IF EXISTS delivery_note_items_updated_at ON public.delivery_note_items;
CREATE TRIGGER delivery_note_items_updated_at
  BEFORE UPDATE ON public.delivery_note_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_note_id ON public.delivery_note_items(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_ordre ON public.delivery_note_items(delivery_note_id, ordre);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_all_auth ON public.delivery_notes;
CREATE POLICY delivery_notes_all_auth ON public.delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_note_items_all_auth ON public.delivery_note_items;
CREATE POLICY delivery_note_items_all_auth ON public.delivery_note_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_notes TO authenticated;
GRANT ALL ON public.delivery_notes TO service_role;
GRANT ALL ON public.delivery_note_items TO authenticated;
GRANT ALL ON public.delivery_note_items TO service_role;
