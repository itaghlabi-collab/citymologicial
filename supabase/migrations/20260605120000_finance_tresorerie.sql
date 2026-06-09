-- =============================================================================
-- CITYMO — Finance & Trésorerie (SQL unique, exécutable en une fois)
-- Tables : finance_categories, finance_charges, payment_orders,
--          finance_transactions, cash_monthly_balances
-- Sans DROP · Sans charge_categories · Base vide ou partielle OK
-- =============================================================================

-- Fonction updated_at (si absente)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. finance_categories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  description     TEXT,
  statut          TEXT NOT NULL DEFAULT 'Active',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_categories_nom_unique
  ON public.finance_categories (lower(trim(nom)));

-- Catégories par défaut (sans doublon)
INSERT INTO public.finance_categories (nom, description, statut)
SELECT v.nom, v.description, v.statut
FROM (VALUES
  ('Carburant',      'Dépenses carburant et déplacements',       'Active'),
  ('Fournitures',    'Fournitures bureau et chantier',          'Active'),
  ('Formation',      'Formations et développement compétences',   'Active'),
  ('Chantier',       'Charges liées aux chantiers / projets',     'Active'),
  ('Main d''œuvre',  'Main d''œuvre et prestations',             'Active'),
  ('Administratif',  'Frais administratifs et gestion',           'Active'),
  ('Divers',         'Autres charges non classées',               'Active')
) AS v(nom, description, statut)
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories fc
  WHERE lower(trim(fc.nom)) = lower(trim(v.nom))
);

-- ── 2. finance_charges (module Charges) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_charge     DATE NOT NULL DEFAULT CURRENT_DATE,
  libelle         TEXT NOT NULL,
  categorie       TEXT,
  category_id     UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  montant         NUMERIC(14,2) NOT NULL DEFAULT 0,
  fournisseur     TEXT,
  projet_lie      TEXT,
  project_id      UUID,
  vehicle_id      UUID,
  worker_id       UUID,
  client_id       UUID,
  supplier_id     UUID,
  departement     TEXT,
  mode_paiement   TEXT DEFAULT 'Virement',
  ref_paiement    TEXT,
  statut          TEXT NOT NULL DEFAULT 'Brouillon',
  commentaire     TEXT,
  validateur      TEXT,
  ref_charge      TEXT,
  justificatifs   JSONB DEFAULT '[]'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL;
ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS worker_id UUID;
ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.finance_charges ADD COLUMN IF NOT EXISTS supplier_id UUID;

CREATE INDEX IF NOT EXISTS idx_finance_charges_category_id ON public.finance_charges(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_charges_date ON public.finance_charges(date_charge);
CREATE INDEX IF NOT EXISTS idx_finance_charges_statut ON public.finance_charges(statut);

-- ── 3. payment_orders (module Ordres de paiement) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_ordre         TEXT,
  beneficiaire      TEXT,
  type_beneficiaire TEXT,
  fournisseur_lie   TEXT,
  employe_lie       TEXT,
  montant           NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_ordre        DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance     DATE,
  statut            TEXT NOT NULL DEFAULT 'Brouillon',
  mode_paiement     TEXT DEFAULT 'Virement',
  banque            TEXT,
  rib               TEXT,
  motif             TEXT,
  ref_reglement     TEXT,
  comptabilise      BOOLEAN NOT NULL DEFAULT FALSE,
  commentaire       TEXT,
  observation       TEXT,
  justificatifs     JSONB DEFAULT '[]'::jsonb,
  prepare_par       TEXT,
  valide_par        TEXT,
  category_id       UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  project_id        UUID,
  worker_id         UUID,
  client_id         UUID,
  supplier_id       UUID,
  charge_id         UUID REFERENCES public.finance_charges(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS type_beneficiaire TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS fournisseur_lie TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS employe_lie TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS ref_reglement TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS comptabilise BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS justificatifs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS prepare_par TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS valide_par TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS worker_id UUID;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS supplier_id UUID;

CREATE INDEX IF NOT EXISTS idx_payment_orders_statut ON public.payment_orders(statut);
CREATE INDEX IF NOT EXISTS idx_payment_orders_date ON public.payment_orders(date_ordre);

-- ── 4. finance_transactions (journal caisse) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_operation    DATE NOT NULL DEFAULT CURRENT_DATE,
  sens              TEXT NOT NULL CHECK (sens IN ('entree', 'sortie')),
  type_operation    TEXT NOT NULL DEFAULT 'autre',
  contrepartie      TEXT,
  description       TEXT NOT NULL,
  montant           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  mode_paiement     TEXT DEFAULT 'Espèces',
  category_id       UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  project_id        UUID,
  vehicle_id        UUID,
  worker_id         UUID,
  client_id         UUID,
  invoice_id        UUID,
  charge_id         UUID REFERENCES public.finance_charges(id) ON DELETE SET NULL,
  payment_order_id  UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  ref_operation     TEXT,
  statut            TEXT NOT NULL DEFAULT 'Validé',
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON public.finance_transactions(date_operation);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_sens ON public.finance_transactions(sens);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_charge ON public.finance_transactions(charge_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_payment_order ON public.finance_transactions(payment_order_id);

-- ── 5. cash_monthly_balances (soldes mensuels) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_monthly_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee           INTEGER NOT NULL,
  mois            INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  solde_initial   NUMERIC(14,2) NOT NULL DEFAULT 0,
  alimentation    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (annee, mois)
);

CREATE INDEX IF NOT EXISTS idx_cash_monthly_balances_period ON public.cash_monthly_balances(annee, mois);

-- ── Triggers updated_at ──────────────────────────────────────────────────────
DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_categories',
    'finance_charges',
    'payment_orders',
    'finance_transactions',
    'cash_monthly_balances'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $do$;

-- ── RLS + policies authenticated ─────────────────────────────────────────────
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_categories',
    'finance_charges',
    'payment_orders',
    'finance_transactions',
    'cash_monthly_balances'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all_auth ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_all_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $rls$;

-- ── FK optionnelles vers autres modules (si tables déjà présentes) ───────────
DO $fk$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_charges_project_id_fkey') THEN
      ALTER TABLE public.finance_charges
        ADD CONSTRAINT finance_charges_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_charges_vehicle_id_fkey') THEN
      ALTER TABLE public.finance_charges
        ADD CONSTRAINT finance_charges_vehicle_id_fkey
        FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_charges_worker_id_fkey') THEN
      ALTER TABLE public.finance_charges
        ADD CONSTRAINT finance_charges_worker_id_fkey
        FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_charges_client_id_fkey') THEN
      ALTER TABLE public.finance_charges
        ADD CONSTRAINT finance_charges_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achat_suppliers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_charges_supplier_id_fkey') THEN
      ALTER TABLE public.finance_charges
        ADD CONSTRAINT finance_charges_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.achat_suppliers(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_factures') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_invoice_id_fkey') THEN
      ALTER TABLE public.finance_transactions
        ADD CONSTRAINT finance_transactions_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES public.crm_factures(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $fk$;

-- ── Migration optionnelle charge_categories → finance_categories ─────────────
DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'charge_categories'
  ) THEN
    INSERT INTO public.finance_categories (id, nom, description, statut, created_by, created_at, updated_at)
    SELECT id, nom, description, statut, created_by, created_at, updated_at
    FROM public.charge_categories
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $migrate$;

-- ── Vérification (doit retourner OK pour les 5 tables) ───────────────────────
SELECT table_name,
       CASE WHEN table_name IS NOT NULL THEN 'OK' ELSE 'MANQUANTE' END AS status
FROM (
  VALUES
    ('finance_categories'),
    ('finance_charges'),
    ('payment_orders'),
    ('finance_transactions'),
    ('cash_monthly_balances')
) AS expected(table_name)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_name = expected.table_name
);
