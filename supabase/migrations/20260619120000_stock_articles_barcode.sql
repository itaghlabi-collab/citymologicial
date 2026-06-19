-- Codes-barres + suivi articles de stock
ALTER TABLE public.stock_articles
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'Disponible';

UPDATE public.stock_articles
SET barcode_value = trim(reference)
WHERE barcode_value IS NULL
  AND reference IS NOT NULL
  AND trim(reference) <> '';

UPDATE public.stock_articles
SET current_state = 'Disponible'
WHERE current_state IS NULL OR trim(current_state) = '';

CREATE UNIQUE INDEX IF NOT EXISTS stock_articles_barcode_value_unique
  ON public.stock_articles (lower(trim(barcode_value)))
  WHERE barcode_value IS NOT NULL AND trim(barcode_value) <> '';

CREATE INDEX IF NOT EXISTS idx_stock_articles_barcode_value
  ON public.stock_articles (barcode_value);

CREATE INDEX IF NOT EXISTS idx_stock_articles_last_scanned_at
  ON public.stock_articles (last_scanned_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_articles_current_state
  ON public.stock_articles (current_state);
