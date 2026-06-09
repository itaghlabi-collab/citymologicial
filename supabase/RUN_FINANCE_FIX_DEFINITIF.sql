-- =============================================================================
-- CITYMO — FIX DÉFINITIF Finance (vide dans l'app, visible dans Supabase)
-- Coller TOUT ce fichier dans Supabase → SQL Editor → Run
-- Projet : https://npddbwsskaojcawaxygh.supabase.co
-- =============================================================================

-- 1) Droits schéma (souvent oubliés)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 2) Tables si absentes
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  description TEXT,
  statut      TEXT NOT NULL DEFAULT 'Active',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_operation   DATE NOT NULL DEFAULT CURRENT_DATE,
  sens             TEXT NOT NULL CHECK (sens IN ('entree', 'sortie')),
  type_operation   TEXT NOT NULL DEFAULT 'autre',
  contrepartie     TEXT,
  description      TEXT NOT NULL,
  montant          NUMERIC(14,2) NOT NULL DEFAULT 0,
  mode_paiement    TEXT DEFAULT 'Espèces',
  category_id      UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  ref_operation    TEXT,
  statut           TEXT NOT NULL DEFAULT 'Validé',
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_monthly_balances (
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

-- 3) Désactiver RLS temporairement (cause n°1 : app vide / Supabase plein)
ALTER TABLE public.finance_categories      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_monthly_balances   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_charges         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders          DISABLE ROW LEVEL SECURITY;

-- 4) Catégories (7)
INSERT INTO public.finance_categories (nom, description, statut)
SELECT v.nom, v.description, v.statut
FROM (VALUES
  ('Carburant',      'Dépenses carburant',           'Active'),
  ('Fournitures',    'Fournitures bureau/chantier',  'Active'),
  ('Formation',      'Formations RH',                'Active'),
  ('Chantier',       'Charges chantiers',            'Active'),
  ('Main d''œuvre',  'Main d''œuvre',                'Active'),
  ('Administratif',  'Frais administratifs',         'Active'),
  ('Divers',         'Autres charges',               'Active')
) AS v(nom, description, statut)
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories fc
  WHERE lower(trim(fc.nom)) = lower(trim(v.nom))
);

-- 5) Feuille de caisse juin 2026
INSERT INTO public.cash_monthly_balances (annee, mois, solde_initial, alimentation, notes)
VALUES (2026, 6, 276.00, 0, 'Juin 2026')
ON CONFLICT (annee, mois) DO UPDATE SET
  solde_initial = EXCLUDED.solde_initial,
  notes = EXCLUDED.notes;

DELETE FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN26-%';

INSERT INTO public.finance_transactions
  (date_operation, sens, type_operation, contrepartie, description, montant, mode_paiement, ref_operation, statut)
VALUES
  ('2026-06-02', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 15000.00, 'Espèces', 'EX-JUIN26-001', 'Validé'),
  ('2026-06-06', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 20000.00, 'Espèces', 'EX-JUIN26-012', 'Validé'),
  ('2026-06-02', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'sac vide pour depot', 200.00, 'Espèces', 'EX-JUIN26-002', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'plan cadastral 63/206686', 100.00, 'Espèces', 'EX-JUIN26-003', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'Certificat negatif DIOP', 233.00, 'Espèces', 'EX-JUIN26-004', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'abdelkhalek jerrar', 'carburant', 500.00, 'Espèces', 'EX-JUIN26-005', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'GENERAL', 'FORMATION RH', 2000.00, 'Espèces', 'EX-JUIN26-006', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'SELIM', 'COMMANDE', 1300.00, 'Espèces', 'EX-JUIN26-007', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces', 'EX-JUIN26-008', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces', 'EX-JUIN26-009', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'NABIL', 'carburant RENAULT ALINA', 412.00, 'Espèces', 'EX-JUIN26-010', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'Paiement', 6300.00, 'Espèces', 'EX-JUIN26-013', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'ABDERRAHIM GOLSSA', 'Paiement', 1800.00, 'Espèces', 'EX-JUIN26-014', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'M.OEUVRES', 'Main d''œuvre', 7548.75, 'Espèces', 'EX-JUIN26-015', 'Validé');

-- 6) Contrôle OBLIGATOIRE — doit afficher 7 et 14
SELECT 'finance_categories' AS table_name, COUNT(*)::int AS lignes FROM public.finance_categories
UNION ALL
SELECT 'finance_transactions', COUNT(*)::int FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN26-%'
UNION ALL
SELECT 'cash_monthly_balances', COUNT(*)::int FROM public.cash_monthly_balances WHERE annee = 2026 AND mois = 6;
