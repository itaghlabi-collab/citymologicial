-- Exécuter dans Supabase → SQL Editor → Run (projet npddbwsskaojcawaxygh ou le vôtre)
-- Corrige : "Could not find the table 'public.delivery_notes' in the schema cache"

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── delivery_notes ──
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
  devis_id            UUID,
  facture_id          UUID,
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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_numero_unique') THEN
    ALTER TABLE public.delivery_notes ADD CONSTRAINT delivery_notes_numero_unique UNIQUE (numero);
  END IF;
END $$;

ALTER TABLE public.delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_statut_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_statut_check
  CHECK (statut IN (
    'brouillon', 'preparation', 'en_attente', 'livre',
    'partiellement_livre', 'facture', 'annule'
  ));

-- FK optionnelles (si tables CRM déjà présentes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_devis') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_devis_id_fkey') THEN
      ALTER TABLE public.delivery_notes
        ADD CONSTRAINT delivery_notes_devis_id_fkey
        FOREIGN KEY (devis_id) REFERENCES public.crm_devis(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_factures') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_facture_id_fkey') THEN
      ALTER TABLE public.delivery_notes
        ADD CONSTRAINT delivery_notes_facture_id_fkey
        FOREIGN KEY (facture_id) REFERENCES public.crm_factures(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_client_id ON public.delivery_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_statut ON public.delivery_notes(statut);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_numero ON public.delivery_notes(numero);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_date_livraison ON public.delivery_notes(date_livraison DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_at ON public.delivery_notes(created_at DESC);

DROP TRIGGER IF EXISTS delivery_notes_updated_at ON public.delivery_notes;
CREATE TRIGGER delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── delivery_note_items ──
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

ALTER TABLE public.delivery_note_items DROP CONSTRAINT IF EXISTS delivery_note_items_statut_ligne_check;
ALTER TABLE public.delivery_note_items
  ADD CONSTRAINT delivery_note_items_statut_ligne_check
  CHECK (statut_ligne IN ('a_livrer', 'livre', 'non_livre', 'en_attente'));

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_note_id ON public.delivery_note_items(delivery_note_id);

DROP TRIGGER IF EXISTS delivery_note_items_updated_at ON public.delivery_note_items;
CREATE TRIGGER delivery_note_items_updated_at
  BEFORE UPDATE ON public.delivery_note_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_all_auth ON public.delivery_notes;
CREATE POLICY delivery_notes_all_auth ON public.delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_note_items_all_auth ON public.delivery_note_items;
CREATE POLICY delivery_note_items_all_auth ON public.delivery_note_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_notes TO authenticated, service_role;
GRANT ALL ON public.delivery_note_items TO authenticated, service_role;

-- Recharger le cache API PostgREST (évite l'erreur schema cache)
NOTIFY pgrst, 'reload schema';

SELECT 'delivery_notes OK' AS status, COUNT(*) AS nb FROM public.delivery_notes;
