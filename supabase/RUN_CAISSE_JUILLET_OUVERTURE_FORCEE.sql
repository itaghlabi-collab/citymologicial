-- Option A — Juillet 2026 démarre à 0 sans report du reliquat juin.
-- Historique juin (mouvements + solde) conservé intact.
-- À exécuter dans Supabase SQL Editor.

ALTER TABLE public.cash_monthly_balances
  ADD COLUMN IF NOT EXISTS force_ouverture boolean NOT NULL DEFAULT false;

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

NOTIFY pgrst, 'reload schema';

-- Vérification
SELECT annee, mois, solde_initial, force_ouverture, notes
FROM public.cash_monthly_balances
WHERE annee = 2026 AND mois IN (6, 7)
ORDER BY mois;
