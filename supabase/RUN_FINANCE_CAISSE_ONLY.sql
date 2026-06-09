-- =============================================================================
-- CITYMO — Tables feuille de caisse UNIQUEMENT
-- À exécuter si finance_charges / payment_orders existent déjà
-- mais finance_transactions et cash_monthly_balances sont absentes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Catégories (requis pour FK optionnelles)
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  description     TEXT,
  statut          TEXT NOT NULL DEFAULT 'Active',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Journal caisse
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
  charge_id         UUID,
  payment_order_id  UUID,
  ref_operation     TEXT,
  statut            TEXT NOT NULL DEFAULT 'Validé',
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON public.finance_transactions(date_operation);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_sens ON public.finance_transactions(sens);

-- Soldes mensuels
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

-- Triggers
DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories', 'finance_transactions', 'cash_monthly_balances'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $do$;

-- RLS
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories', 'finance_transactions', 'cash_monthly_balances'] LOOP
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

-- Contrôle
SELECT 'finance_transactions' AS table_name, COUNT(*) AS lignes FROM public.finance_transactions
UNION ALL
SELECT 'cash_monthly_balances', COUNT(*) FROM public.cash_monthly_balances;
