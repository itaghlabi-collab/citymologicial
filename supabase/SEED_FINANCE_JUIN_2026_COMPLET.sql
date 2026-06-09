-- =============================================================================
-- CITYMO — Finance juin 2026 COMPLET (à coller dans Supabase → SQL Editor → Run)
-- Crée les tables si absentes + catégories + feuille de caisse juin 2026
-- Totaux attendus :
--   Solde initial  =     276,00 MAD
--   Entrées        =  35 000,00 MAD
--   Sorties        =  20 793,75 MAD
--   Solde du mois  =  14 482,25 MAD
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Tables ───────────────────────────────────────────────────────────────────
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
  montant          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
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

-- RLS
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories','finance_transactions','cash_monthly_balances'] LOOP
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

-- ── Catégories ───────────────────────────────────────────────────────────────
INSERT INTO public.finance_categories (nom, description, statut)
SELECT v.nom, v.description, v.statut
FROM (VALUES
  ('Carburant',      'Dépenses carburant et déplacements',      'Active'),
  ('Fournitures',    'Fournitures bureau et chantier',         'Active'),
  ('Formation',      'Formations et développement compétences', 'Active'),
  ('Chantier',       'Charges liées aux chantiers / projets',    'Active'),
  ('Main d''œuvre',  'Main d''œuvre et prestations',            'Active'),
  ('Administratif',  'Frais administratifs et gestion',          'Active'),
  ('Divers',         'Autres charges non classées',              'Active')
) AS v(nom, description, statut)
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_categories fc
  WHERE lower(trim(fc.nom)) = lower(trim(v.nom))
);

-- ── Solde mensuel juin 2026 ──────────────────────────────────────────────────
INSERT INTO public.cash_monthly_balances (annee, mois, solde_initial, alimentation, notes)
VALUES (2026, 6, 276.00, 0, 'Feuille de caisse juin 2026')
ON CONFLICT (annee, mois) DO UPDATE SET
  solde_initial = EXCLUDED.solde_initial,
  alimentation  = EXCLUDED.alimentation,
  notes         = EXCLUDED.notes;

-- ── Opérations juin 2026 (ré-exécutable) ─────────────────────────────────────
DELETE FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN26-%';

INSERT INTO public.finance_transactions
  (date_operation, sens, type_operation, contrepartie, description, montant, mode_paiement, category_id, ref_operation, statut)
VALUES
  ('2026-06-02', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 15000.00, 'Espèces', NULL, 'EX-JUIN26-001', 'Validé'),
  ('2026-06-06', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 20000.00, 'Espèces', NULL, 'EX-JUIN26-012', 'Validé'),

  ('2026-06-02', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'sac vide pour depot', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'divers' LIMIT 1), 'EX-JUIN26-002', 'Validé'),

  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'plan cadastral 63/206686', 100.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'administratif' LIMIT 1), 'EX-JUIN26-003', 'Validé'),

  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'Certificat negatif DIOP', 233.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'administratif' LIMIT 1), 'EX-JUIN26-004', 'Validé'),

  ('2026-06-04', 'sortie', 'autre_sortie', 'abdelkhalek jerrar', 'carburant', 500.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'carburant' LIMIT 1), 'EX-JUIN26-005', 'Validé'),

  ('2026-06-05', 'sortie', 'autre_sortie', 'GENERAL', 'FORMATION RH', 2000.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'formation' LIMIT 1), 'EX-JUIN26-006', 'Validé'),

  ('2026-06-05', 'sortie', 'autre_sortie', 'SELIM', 'COMMANDE', 1300.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'fournitures' LIMIT 1), 'EX-JUIN26-007', 'Validé'),

  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'divers' LIMIT 1), 'EX-JUIN26-008', 'Validé'),

  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'divers' LIMIT 1), 'EX-JUIN26-009', 'Validé'),

  ('2026-06-05', 'sortie', 'autre_sortie', 'NABIL', 'carburant RENAULT ALINA', 412.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'carburant' LIMIT 1), 'EX-JUIN26-010', 'Validé'),

  ('2026-06-06', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'Paiement', 6300.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'chantier' LIMIT 1), 'EX-JUIN26-013', 'Validé'),

  ('2026-06-06', 'sortie', 'autre_sortie', 'ABDERRAHIM GOLSSA', 'Paiement', 1800.00, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'chantier' LIMIT 1), 'EX-JUIN26-014', 'Validé'),

  ('2026-06-06', 'sortie', 'autre_sortie', 'M.OEUVRES', 'Main d''œuvre', 7548.75, 'Espèces',
    (SELECT id FROM public.finance_categories WHERE lower(trim(nom)) = 'main d''œuvre' LIMIT 1), 'EX-JUIN26-015', 'Validé');

-- ── Contrôle ─────────────────────────────────────────────────────────────────
SELECT nom, statut FROM public.finance_categories ORDER BY nom;

SELECT COUNT(*) AS nb_operations_juin
FROM public.finance_transactions
WHERE ref_operation LIKE 'EX-JUIN26-%';

SELECT
  b.solde_initial,
  COALESCE(SUM(CASE WHEN t.sens = 'entree'  THEN t.montant END), 0) AS total_entrees,
  COALESCE(SUM(CASE WHEN t.sens = 'sortie'  THEN t.montant END), 0) AS total_sorties,
  b.solde_initial + COALESCE(SUM(CASE WHEN t.sens = 'entree' THEN t.montant WHEN t.sens = 'sortie' THEN -t.montant END), 0) AS solde_mois
FROM public.cash_monthly_balances b
LEFT JOIN public.finance_transactions t
  ON t.date_operation >= '2026-06-01' AND t.date_operation < '2026-07-01'
  AND t.statut <> 'Annulé'
WHERE b.annee = 2026 AND b.mois = 6
GROUP BY b.solde_initial;
