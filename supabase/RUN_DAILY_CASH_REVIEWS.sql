-- =============================================================================
-- CITYMO — Table daily_cash_reviews (validation journalière DG)
-- Supabase → SQL Editor → Run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.daily_cash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date date NOT NULL UNIQUE,
  validated_by uuid REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS daily_cash_reviews_date_idx
  ON public.daily_cash_reviews (review_date DESC);

-- Migration depuis l'ancienne table si elle existe
INSERT INTO public.daily_cash_reviews (review_date, validated_by, validated_at, notes)
SELECT date_validation, validated_by, validated_at, notes
FROM public.cash_daily_validations
WHERE NOT EXISTS (
  SELECT 1 FROM public.daily_cash_reviews d WHERE d.review_date = cash_daily_validations.date_validation
);

ALTER TABLE public.daily_cash_reviews DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.daily_cash_reviews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'daily_cash_reviews OK' AS status;
