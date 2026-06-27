-- CITYMO — Scan code-barres / QR code — articles de stock
-- À exécuter dans Supabase → SQL Editor (re-exécutable sans risque)

-- ── Colonnes scan & état opérationnel ─────────────────────────────────────────
ALTER TABLE public.stock_articles
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'Disponible';

ALTER TABLE public.stock_articles
  ADD COLUMN IF NOT EXISTS emplacement TEXT;

-- Code-barres = code article (référence) pour les lignes existantes
UPDATE public.stock_articles
SET barcode_value = trim(reference)
WHERE (barcode_value IS NULL OR trim(barcode_value) = '')
  AND reference IS NOT NULL
  AND trim(reference) <> '';

UPDATE public.stock_articles
SET current_state = 'Disponible'
WHERE current_state IS NULL OR trim(current_state) = '';

-- ── Index recherche rapide (douchette / scan) ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS stock_articles_barcode_value_unique
  ON public.stock_articles (lower(trim(barcode_value)))
  WHERE barcode_value IS NOT NULL AND trim(barcode_value) <> '';

CREATE INDEX IF NOT EXISTS idx_stock_articles_barcode_value
  ON public.stock_articles (barcode_value);

CREATE INDEX IF NOT EXISTS idx_stock_articles_reference_lower
  ON public.stock_articles (lower(trim(reference)));

CREATE INDEX IF NOT EXISTS idx_stock_articles_last_scanned_at
  ON public.stock_articles (last_scanned_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_articles_current_state
  ON public.stock_articles (current_state);

-- ── Droits (si table déjà en RLS) ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_articles TO authenticated;
GRANT ALL ON public.stock_articles TO service_role;

-- ── Vérification ─────────────────────────────────────────────────────────────
SELECT
  COUNT(*)::int AS total_articles,
  COUNT(*) FILTER (WHERE barcode_value IS NOT NULL AND trim(barcode_value) <> '')::int AS avec_code_barres,
  COUNT(*) FILTER (WHERE last_scanned_at IS NOT NULL)::int AS deja_scannes,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stock_articles'
        AND column_name = 'barcode_value'
    ) THEN 'OK'
    ELSE 'MANQUANT'
  END AS colonnes_scan
FROM public.stock_articles;

SELECT reference, barcode_value, current_state, emplacement, last_scanned_at
FROM public.stock_articles
ORDER BY reference
LIMIT 15;
