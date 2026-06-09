-- =============================================================================
-- CITYMO — Finance & Trésorerie COMPLET (installation from scratch)
-- Coller dans Supabase → SQL Editor → Run (une seule fois)
-- Projet : https://npddbwsskaojcawaxygh.supabase.co
--
-- Crée : 5 tables + 7 catégories + feuille de caisse juin 2026 (Excel)
-- RLS désactivé pour que l'app lise les données immédiatement
--
-- Résultat attendu :
--   finance_categories     → 7
--   operations_juin_2026   → 14
--   solde_initial          → 276
--   total_entrees          → 35000
--   total_sorties          → 20793.75
--   solde_mois             → 14482.25
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Suppression propre (si réinstallation) ───────────────────────────────────
DROP TABLE IF EXISTS public.finance_transactions   CASCADE;
DROP TABLE IF EXISTS public.payment_orders         CASCADE;
DROP TABLE IF EXISTS public.finance_charges        CASCADE;
DROP TABLE IF EXISTS public.cash_monthly_balances  CASCADE;
DROP TABLE IF EXISTS public.finance_categories     CASCADE;

-- ── 1. Catégories ────────────────────────────────────────────────────────────
CREATE TABLE public.finance_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  description TEXT,
  statut      TEXT NOT NULL DEFAULT 'Active',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_finance_categories_nom ON public.finance_categories (lower(trim(nom)));

-- ── 2. Charges ───────────────────────────────────────────────────────────────
CREATE TABLE public.finance_charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_charge   DATE NOT NULL DEFAULT CURRENT_DATE,
  libelle       TEXT NOT NULL,
  categorie     TEXT,
  category_id   UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  montant       NUMERIC(14,2) NOT NULL DEFAULT 0,
  fournisseur   TEXT,
  projet_lie    TEXT,
  project_id    UUID,
  vehicle_id    UUID,
  worker_id     UUID,
  client_id     UUID,
  supplier_id   UUID,
  departement   TEXT,
  mode_paiement TEXT DEFAULT 'Virement',
  ref_paiement  TEXT,
  statut        TEXT NOT NULL DEFAULT 'Brouillon',
  commentaire   TEXT,
  validateur    TEXT,
  ref_charge    TEXT,
  justificatifs JSONB DEFAULT '[]'::jsonb,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Ordres de paiement ────────────────────────────────────────────────────
CREATE TABLE public.payment_orders (
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

-- ── 4. Journal caisse ────────────────────────────────────────────────────────
CREATE TABLE public.finance_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_operation   DATE NOT NULL,
  sens             TEXT NOT NULL CHECK (sens IN ('entree', 'sortie')),
  type_operation   TEXT NOT NULL DEFAULT 'autre',
  contrepartie     TEXT,
  description      TEXT NOT NULL,
  montant          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  mode_paiement    TEXT DEFAULT 'Espèces',
  category_id      UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  project_id       UUID,
  vehicle_id       UUID,
  worker_id        UUID,
  client_id        UUID,
  invoice_id       UUID,
  charge_id        UUID REFERENCES public.finance_charges(id) ON DELETE SET NULL,
  payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  ref_operation    TEXT,
  statut           TEXT NOT NULL DEFAULT 'Validé',
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fin_tx_date ON public.finance_transactions(date_operation);

-- ── 5. Soldes mensuels ─────────────────────────────────────────────────────
CREATE TABLE public.cash_monthly_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee         INTEGER NOT NULL,
  mois          INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  solde_initial NUMERIC(14,2) NOT NULL DEFAULT 0,
  alimentation  NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (annee, mois)
);

-- ── Triggers updated_at ────────────────────────────────────────────────────
DO $t$ DECLARE tbl TEXT; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'finance_categories','finance_charges','payment_orders',
    'finance_transactions','cash_monthly_balances'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl, tbl);
  END LOOP;
END $t$;

-- ── Droits (RLS off = lecture directe par l'app) ───────────────────────────
ALTER TABLE public.finance_categories    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_charges       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_monthly_balances DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.finance_categories    TO anon, authenticated, service_role;
GRANT ALL ON public.finance_charges       TO anon, authenticated, service_role;
GRANT ALL ON public.payment_orders        TO anon, authenticated, service_role;
GRANT ALL ON public.finance_transactions  TO anon, authenticated, service_role;
GRANT ALL ON public.cash_monthly_balances TO anon, authenticated, service_role;

-- ── Données : 7 catégories ───────────────────────────────────────────────────
INSERT INTO public.finance_categories (nom, description, statut) VALUES
  ('Carburant',      'Dépenses carburant et déplacements',      'Active'),
  ('Fournitures',    'Fournitures bureau et chantier',         'Active'),
  ('Formation',      'Formations et développement compétences', 'Active'),
  ('Chantier',       'Charges liées aux chantiers / projets',    'Active'),
  ('Main d''œuvre',  'Main d''œuvre et prestations',            'Active'),
  ('Administratif',  'Frais administratifs et gestion',          'Active'),
  ('Divers',         'Autres charges non classées',              'Active');

-- ── Données : solde juin 2026 (Excel : 276 = solde mois précédent) ───────────
INSERT INTO public.cash_monthly_balances (annee, mois, solde_initial, alimentation, notes)
VALUES (2026, 6, 276.00, 0, 'Feuille de caisse juin 2026');

-- ── Données : 14 opérations juin 2026 (Excel CITYMO) ─────────────────────────
INSERT INTO public.finance_transactions
  (date_operation, sens, type_operation, contrepartie, description, montant, mode_paiement, category_id, ref_operation, statut)
VALUES
  ('2026-06-02', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 15000.00, 'Espèces', NULL, 'EX-JUIN26-001', 'Validé'),
  ('2026-06-06', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 20000.00, 'Espèces', NULL, 'EX-JUIN26-002', 'Validé'),
  ('2026-06-02', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'sac vide pour depot', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='divers' LIMIT 1), 'EX-JUIN26-003', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'plan cadastral 63/206686', 100.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='administratif' LIMIT 1), 'EX-JUIN26-004', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'Certificat negatif DIOP', 233.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='administratif' LIMIT 1), 'EX-JUIN26-005', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'abdelkhalek jerrar', 'carburant', 500.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='carburant' LIMIT 1), 'EX-JUIN26-006', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'GENERAL', 'FORMATION RH', 2000.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='formation' LIMIT 1), 'EX-JUIN26-007', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'SELIM', 'COMMANDE', 1300.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='fournitures' LIMIT 1), 'EX-JUIN26-008', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='divers' LIMIT 1), 'EX-JUIN26-009', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='divers' LIMIT 1), 'EX-JUIN26-010', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'NABIL', 'carburant RENAULT ALINA', 412.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='carburant' LIMIT 1), 'EX-JUIN26-011', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'Paiement', 6300.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='chantier' LIMIT 1), 'EX-JUIN26-012', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'ABDERRAHIM GOLSSA', 'Paiement', 1800.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='chantier' LIMIT 1), 'EX-JUIN26-013', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'M.OEUVRES', 'Main d''œuvre', 7548.75, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom))='main d''œuvre' LIMIT 1), 'EX-JUIN26-014', 'Validé');

-- ── Contrôle final ───────────────────────────────────────────────────────────
SELECT 'finance_categories' AS element, COUNT(*)::text AS valeur FROM public.finance_categories
UNION ALL SELECT 'operations_juin_2026', COUNT(*)::text FROM public.finance_transactions WHERE date_operation >= '2026-06-01' AND date_operation < '2026-07-01'
UNION ALL SELECT 'solde_initial', solde_initial::text FROM public.cash_monthly_balances WHERE annee=2026 AND mois=6
UNION ALL SELECT 'total_entrees', COALESCE(SUM(montant),0)::text FROM public.finance_transactions WHERE sens='entree' AND date_operation >= '2026-06-01' AND date_operation < '2026-07-01'
UNION ALL SELECT 'total_sorties', COALESCE(SUM(montant),0)::text FROM public.finance_transactions WHERE sens='sortie' AND date_operation >= '2026-06-01' AND date_operation < '2026-07-01'
UNION ALL SELECT 'solde_mois', (
  SELECT (b.solde_initial + COALESCE(SUM(CASE WHEN t.sens='entree' THEN t.montant WHEN t.sens='sortie' THEN -t.montant END),0))::text
  FROM public.cash_monthly_balances b
  LEFT JOIN public.finance_transactions t ON t.date_operation >= '2026-06-01' AND t.date_operation < '2026-07-01'
  WHERE b.annee=2026 AND b.mois=6 GROUP BY b.solde_initial
);
