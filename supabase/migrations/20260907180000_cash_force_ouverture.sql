-- Caisse : ouverture forcée (coupure de la chaîne de report mensuel)
ALTER TABLE public.cash_monthly_balances
  ADD COLUMN IF NOT EXISTS force_ouverture boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cash_monthly_balances.force_ouverture IS
  'Si true, solde_initial stocké est utilisé tel quel (pas de report du mois précédent).';

-- Option A métier CITYMO : juillet 2026 ouvre à 0, juin reste en archive.
INSERT INTO public.cash_monthly_balances (annee, mois, solde_initial, alimentation, notes, force_ouverture)
VALUES (
  2026,
  7,
  0,
  0,
  'Option A — ouverture forcée à 0 (pas de report juin)',
  true
)
ON CONFLICT (annee, mois) DO UPDATE SET
  solde_initial = 0,
  force_ouverture = true,
  notes = EXCLUDED.notes,
  updated_at = NOW();
